import { z } from "zod";
import type { ConcurrencyLimit } from "../../behaviors/concurrency-limit";
import { CountingSemaphore } from "../../behaviors/counting-semaphore";
import { SampledServiceTime } from "../../behaviors/sampled-service-time";
import type { ServiceTime } from "../../behaviors/service-time";
import { distributionSchema } from "../../random/distribution";
import type {
  ArriveInput,
  ComponentBehavior,
  Effect,
  FinishInput,
} from "../component-behavior";
import type {
  BuildContext,
  ComponentDefinition,
} from "../component-definition";

const lambdaConfig = z.object({
  /** Invocations running at once before Lambda throttles. 0 turns the function off. */
  concurrency: z.number().int().min(0),
  /** Extra time when no warm execution environment is free. */
  coldStart: distributionSchema,
  /**
   * How long an idle environment stays warm. AWS doesn't publish this;
   * observed values are roughly 5 to 15 minutes.
   */
  idleTimeoutSec: z.number().nonnegative(),
  /** The handler's own work, not counting its nested calls. */
  computeTime: distributionSchema,
});
export type LambdaConfig = z.infer<typeof lambdaConfig>;

/**
 * AWS Lambda (MVP design §3.2): a concurrency limit that throttles instead of
 * queueing, plus warm execution environments.
 *
 * Each finished invocation leaves a warm environment behind. An invocation
 * that finds one warm starts right away; otherwise it pays a cold start
 * first. Environments idle for `idleTimeoutSec` go cold. That check happens
 * when the next request arrives, so no timer is needed (ADR-0006).
 *
 * The concurrency slot is held for the whole invocation: cold start, compute
 * time, and all nested calls. That's why slow dependencies raise concurrency.
 *
 * Differences from AWS (shared account pool, scaling rate, no function
 * timeout, ...) are listed in docs/design/fidelity.md as LMB-1 to LMB-9.
 */
export const lambdaDefinition: ComponentDefinition<LambdaConfig> = {
  type: "lambda",
  displayName: "Lambda",
  configSchema: lambdaConfig,
  defaultConfig: {
    concurrency: 1_000,
    coldStart: { kind: "lognormal", medianMs: 300, p99Ms: 1_000 },
    idleTimeoutSec: 600,
    computeTime: { kind: "lognormal", medianMs: 20, p99Ms: 80 },
  },
  actions: ["invoke"],
  deliversAsync: false,
  build<T>(config: LambdaConfig, context: BuildContext): ComponentBehavior<T> {
    return new LambdaBehavior<T>(config, context);
  },
};

/** Lambda's run-time state: concurrency slots and warm environments. */
class LambdaBehavior<T> implements ComponentBehavior<T> {
  readonly queueDepth = 0;
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

  constructor(config: LambdaConfig, { random }: BuildContext) {
    // eslint-disable-next-line no-restricted-syntax -- moves to a factory in R2.8 (ADR-0009)
    this.slots = new CountingSemaphore<T>({
      limit: config.concurrency,
      whenFull: "reject",
    });
    // eslint-disable-next-line no-restricted-syntax -- moves to a factory in R2.8 (ADR-0009)
    this.coldStart = new SampledServiceTime(config.coldStart, random);
    // eslint-disable-next-line no-restricted-syntax -- moves to a factory in R2.8 (ADR-0009)
    this.computeTime = new SampledServiceTime(config.computeTime, random);
    this.idleTimeoutMs = config.idleTimeoutSec * 1000;
  }

  get inProgress(): number {
    return this.slots.inUse;
  }

  get counters(): Readonly<Record<string, number>> {
    return { coldStarts: this.coldStarts };
  }

  arrive({ request, nowMs }: ArriveInput<T>): Effect<T>[] {
    if (this.slots.acquire(request) === "rejected") {
      return [{ kind: "rejected", request, reason: "throttled" }];
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
