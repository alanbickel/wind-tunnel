import type { ConcurrencyLimit } from "../../behaviors/concurrency-limit";
import type { RateLimit } from "../../behaviors/rate-limit";
import type { ServiceTime } from "../../behaviors/service-time";
import type {
  ArriveInput,
  ComponentBehavior,
  Effect,
  FinishInput,
  LimitGauge,
  RefuseWhenFull,
} from "../component-behavior";
import { concurrencyGauge, rateGauge } from "../limit-gauges";

/**
 * Rejects an invocation that finds every concurrency slot taken, or the
 * request rate spent: AWS returns `429 TooManyRequestsException` for both.
 */
export const THROTTLED: RefuseWhenFull = {
  kind: "refuse",
  reason: "throttled",
};

export interface LambdaBehaviorDependencies<T> {
  /** Concurrency slots; full means throttled, not queued. */
  readonly slots: ConcurrencyLimit<T>;
  /** Invocations a second, 10 × the concurrency; empty means throttled. */
  readonly requestRate: RateLimit;
  readonly coldStart: ServiceTime;
  readonly computeTime: ServiceTime;
  /** How long an idle environment stays warm. */
  readonly idleTimeoutMs: number;
}

/**
 * Lambda's run-time state: concurrency slots, the request rate, and warm
 * environments.
 */
export class LambdaBehavior<T> implements ComponentBehavior<T> {
  readonly queueDepth = 0;
  readonly limits: readonly LimitGauge[];
  private readonly slots: ConcurrencyLimit<T>;
  private readonly requestRate: RateLimit;
  private readonly coldStart: ServiceTime;
  private readonly computeTime: ServiceTime;
  private readonly idleTimeoutMs: number;
  /**
   * When each idle warm environment last finished, oldest first. Finishes
   * happen in time order, so pushing keeps the array sorted.
   */
  private readonly idleSince: number[] = [];
  private coldStarts = 0;

  constructor(dependencies: LambdaBehaviorDependencies<T>) {
    this.slots = dependencies.slots;
    this.requestRate = dependencies.requestRate;
    this.coldStart = dependencies.coldStart;
    this.computeTime = dependencies.computeTime;
    this.idleTimeoutMs = dependencies.idleTimeoutMs;
    this.limits = [
      concurrencyGauge({
        name: "concurrency",
        whenFull: THROTTLED,
        source: this.slots,
      }),
      rateGauge({
        name: "requestRate",
        whenFull: THROTTLED,
        source: this.requestRate,
      }),
    ];
  }

  get inProgress(): number {
    return this.slots.inUse;
  }

  get counters(): Readonly<Record<string, number>> {
    return { coldStarts: this.coldStarts };
  }

  arrive({ request, nowMs }: ArriveInput<T>): Effect<T>[] {
    if (!this.admits(request, nowMs)) {
      return [{ kind: "rejected", request, reason: THROTTLED.reason }];
    }
    // The cold start, if any, is drawn before the compute time.
    const serviceMs = this.initMs(nowMs) + this.computeTime.next();
    return [{ kind: "started", request, serviceMs }];
  }

  finish({ nowMs }: FinishInput<T>): Effect<T>[] {
    this.slots.release();
    this.idleSince.push(nowMs);
    return [];
  }

  /**
   * Whether the invocation gets both a token and a slot. AWS doesn't say
   * which limit it checks first (LMB-10), so neither is spent on an
   * invocation the other refuses: a slot is looked for before the token is
   * taken, and taken after. A full concurrency limit therefore refuses
   * first, so `concurrency: 0` refuses every invocation at `concurrency`.
   */
  private admits(request: T, nowMs: number): boolean {
    if (this.slots.inUse >= this.slots.limit) return false;
    if (!this.requestRate.tryTake(nowMs)) return false;
    return this.slots.acquire(request) === "admitted";
  }

  /** 0 in a warm environment; otherwise a cold start, which is counted. */
  private initMs(nowMs: number): number {
    if (this.takeWarm(nowMs)) return 0;
    this.coldStarts++;
    return this.coldStart.next();
  }

  /** Takes the most recently used warm environment, if any is still warm. */
  private takeWarm(nowMs: number): boolean {
    let expired = 0;
    for (const since of this.idleSince) {
      if (nowMs - since < this.idleTimeoutMs) break;
      expired++;
    }
    this.idleSince.splice(0, expired);
    return this.idleSince.pop() !== undefined;
  }
}
