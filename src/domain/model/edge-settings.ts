import { z } from "zod";
import type {
  BackoffStrategy,
  Edge,
  EdgeRetry,
  RetryPolicy,
  RetryPreset,
} from "./project";

/**
 * Every backoff strategy. A strategy added to or removed from
 * `BackoffStrategy`, or a value that isn't its own key, fails typecheck here.
 */
const BACKOFF_STRATEGIES = {
  none: "none",
  exponential: "exponential",
  "exponential-jitter": "exponential-jitter",
} as const satisfies { readonly [K in BackoffStrategy]: K };

/** Attempts in all, counting the first: 1 to 10. */
const maxAttemptsSchema = z.number().int().min(1).max(10);

/** A custom retry policy, as `RetryPolicy` describes it. */
export const retryPolicySchema = z.strictObject({
  maxAttempts: maxAttemptsSchema,
  backoff: z.enum(BACKOFF_STRATEGIES),
  baseDelayMs: z.number().nonnegative(),
}) satisfies z.ZodType<RetryPolicy>;

/** The AWS SDK standard preset, as `RetryPreset` describes it. */
export const retryPresetSchema = z.strictObject({
  preset: z.literal("aws-sdk-standard"),
  maxAttempts: maxAttemptsSchema.optional(),
}) satisfies z.ZodType<RetryPreset>;

/** An edge's retries: a custom policy or the preset (ADR-0025 decision 3.1). */
export const edgeRetrySchema = z.union([
  retryPolicySchema,
  retryPresetSchema,
]) satisfies z.ZodType<EdgeRetry>;

/**
 * What an edge's settings may be: its latency, its timeout, and its retry
 * policy, apart from the ends it joins. The project document's edge schema
 * builds on it.
 */
export const edgeSettingsSchema = z.strictObject({
  latencyMs: z.number().nonnegative(),
  timeoutMs: z.number().positive(),
  retry: edgeRetrySchema,
}) satisfies z.ZodType<EdgeSettings>;

/** An edge's settings: everything but its id and the components it joins. */
export type EdgeSettings = Pick<Edge, "latencyMs" | "timeoutMs" | "retry">;
