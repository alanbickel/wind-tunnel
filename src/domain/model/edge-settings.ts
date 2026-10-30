import { z } from "zod";
import type { Edge } from "./project";

/** An edge's retry policy, as `RetryPolicy` describes it. At most 10 attempts. */
export const retryPolicySchema = z.strictObject({
  maxAttempts: z.number().int().min(1).max(10),
  backoff: z.enum(["none", "exponential", "exponential-jitter"]),
  baseDelayMs: z.number().nonnegative(),
});

/**
 * What an edge's settings may be: its latency, its timeout, and its retry
 * policy, apart from the ends it joins. The project document's edge schema
 * builds on it.
 */
export const edgeSettingsSchema = z.strictObject({
  latencyMs: z.number().nonnegative(),
  timeoutMs: z.number().positive(),
  retry: retryPolicySchema,
});

/** An edge's settings: everything but its id and the components it joins. */
export type EdgeSettings = Pick<Edge, "latencyMs" | "timeoutMs" | "retry">;
