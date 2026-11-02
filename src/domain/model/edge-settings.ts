import { z } from "zod";
import type { BackoffStrategy, Edge, RetryPolicy } from "./project";

/**
 * Every backoff strategy. A strategy added to or removed from
 * `BackoffStrategy`, or a value that isn't its own key, fails typecheck here.
 */
const BACKOFF_STRATEGIES = {
  none: "none",
  exponential: "exponential",
  "exponential-jitter": "exponential-jitter",
} as const satisfies { readonly [K in BackoffStrategy]: K };

/** An edge's retry policy, as `RetryPolicy` describes it. At most 10 attempts. */
export const retryPolicySchema = z.strictObject({
  maxAttempts: z.number().int().min(1).max(10),
  backoff: z.enum(BACKOFF_STRATEGIES),
  baseDelayMs: z.number().nonnegative(),
}) satisfies z.ZodType<RetryPolicy>;

/**
 * What an edge's settings may be: its latency, its timeout, and its retry
 * policy, apart from the ends it joins. The project document's edge schema
 * builds on it.
 */
export const edgeSettingsSchema = z.strictObject({
  latencyMs: z.number().nonnegative(),
  timeoutMs: z.number().positive(),
  retry: retryPolicySchema,
}) satisfies z.ZodType<EdgeSettings>;

/** An edge's settings: everything but its id and the components it joins. */
export type EdgeSettings = Pick<Edge, "latencyMs" | "timeoutMs" | "retry">;
