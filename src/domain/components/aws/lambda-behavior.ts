import type { ConcurrencyLimit } from "../../behaviors/concurrency-limit";
import type { ServiceTime } from "../../behaviors/service-time";
import type {
  ArriveInput,
  ComponentBehavior,
  Effect,
  FinishInput,
  LimitGauge,
  RefuseWhenFull,
} from "../component-behavior";
import { concurrencyGauge } from "../limit-gauges";

/** Rejects an invocation that finds every concurrency slot taken. */
const THROTTLED: RefuseWhenFull = { kind: "refuse", reason: "throttled" };

export interface LambdaBehaviorDependencies<T> {
  /** Concurrency slots; full means throttled, not queued. */
  readonly slots: ConcurrencyLimit<T>;
  readonly coldStart: ServiceTime;
  readonly computeTime: ServiceTime;
  /** How long an idle environment stays warm. */
  readonly idleTimeoutMs: number;
}

/** Lambda's run-time state: concurrency slots and warm environments. */
export class LambdaBehavior<T> implements ComponentBehavior<T> {
  readonly queueDepth = 0;
  readonly limits: readonly LimitGauge[];
  private readonly slots: ConcurrencyLimit<T>;
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
    this.coldStart = dependencies.coldStart;
    this.computeTime = dependencies.computeTime;
    this.idleTimeoutMs = dependencies.idleTimeoutMs;
    this.limits = [
      concurrencyGauge({
        name: "concurrency",
        whenFull: THROTTLED,
        source: this.slots,
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
    if (this.slots.acquire(request) === "rejected") {
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
