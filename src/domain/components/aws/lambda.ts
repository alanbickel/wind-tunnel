import { z } from "zod";
import { CountingSemaphore } from "../../behaviors/counting-semaphore";
import { SampledServiceTime } from "../../behaviors/sampled-service-time";
import { distributionSchema } from "../../random/distribution";
import type { ComponentBehavior } from "../component-behavior";
import type {
  BuildContext,
  ComponentDefinition,
} from "../component-definition";
import { LambdaBehavior, THROTTLED } from "./lambda-behavior";

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
  rejectionReasons: [THROTTLED.reason],
  build<T>(
    config: LambdaConfig,
    { random }: BuildContext,
  ): ComponentBehavior<T> {
    return new LambdaBehavior<T>({
      slots: new CountingSemaphore<T>({
        limit: config.concurrency,
        whenFull: "reject",
      }),
      coldStart: new SampledServiceTime(config.coldStart, random),
      computeTime: new SampledServiceTime(config.computeTime, random),
      idleTimeoutMs: config.idleTimeoutSec * 1000,
    });
  },
};
