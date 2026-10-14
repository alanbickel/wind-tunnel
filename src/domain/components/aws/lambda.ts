import { z } from "zod";
import { ConcurrencyLimit } from "../../behaviors/concurrency-limit";
import { ServiceTime } from "../../behaviors/service-time";
import { distributionSchema } from "../../random/distribution";
import type { ComponentBehavior } from "../component-behavior";
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
  build<T>(
    config: LambdaConfig,
    { random }: BuildContext,
  ): ComponentBehavior<T> {
    const slots = new ConcurrencyLimit<T>({
      limit: config.concurrency,
      whenFull: "reject",
    });
    const coldStart = new ServiceTime(config.coldStart, random);
    const computeTime = new ServiceTime(config.computeTime, random);
    const idleTimeoutMs = config.idleTimeoutSec * 1000;
    // When each idle warm environment last finished, oldest first. Finishes
    // happen in time order, so pushing keeps the array sorted.
    const idleSince: number[] = [];

    /** Takes the most recently used warm environment, if any is still warm. */
    const takeWarm = (nowMs: number): boolean => {
      let expired = 0;
      for (const since of idleSince) {
        if (nowMs - since < idleTimeoutMs) break;
        expired++;
      }
      idleSince.splice(0, expired);
      return idleSince.pop() !== undefined;
    };

    return {
      arrive(request, _action, nowMs) {
        if (slots.acquire(request) === "rejected") {
          return [{ kind: "rejected", request, reason: "throttled" }];
        }
        const initMs = takeWarm(nowMs) ? 0 : coldStart.next();
        return [
          { kind: "started", request, serviceMs: initMs + computeTime.next() },
        ];
      },
      finish(_request, nowMs) {
        slots.release();
        idleSince.push(nowMs);
        return [];
      },
      get inProgress() {
        return slots.inUse;
      },
      queueDepth: 0,
    };
  },
};
