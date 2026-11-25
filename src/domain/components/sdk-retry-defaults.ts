import { z } from "zod";

/**
 * How a service's AWS SDK client departs from the SDKs' standard retries,
 * for the preset on edges into its type (ADR-0025 decision 3.3).
 * DynamoDB's clients make 4 attempts and wait from 25 ms after a
 * transient error.
 */
export interface SdkRetryDefaults {
  /** Attempts in all, counting the first, in place of the SDK's 3. */
  readonly maxAttempts: number;
  /** The base delay after a transient error, in place of the SDK's 50 ms. */
  readonly transientBaseDelayMs: number;
}

/** The values `SdkRetryDefaults` may take; an edge allows the same attempts. */
export const sdkRetryDefaultsSchema = z.strictObject({
  maxAttempts: z.number().int().min(1).max(10),
  transientBaseDelayMs: z.number().nonnegative(),
}) satisfies z.ZodType<SdkRetryDefaults>;
