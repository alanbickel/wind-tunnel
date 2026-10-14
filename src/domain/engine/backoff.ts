import type { RetryPolicy } from "../model/project";
import type { RandomSource } from "../random/random-source";

/** Longest wait between attempts; the AWS SDKs cap backoff at 20 s. */
export const MAX_BACKOFF_MS = 20_000;

/**
 * How long to wait before the next attempt, after `failedAttempts` failures
 * (1 for the first retry).
 *
 * - `none`: always `baseDelayMs`.
 * - `exponential`: `baseDelayMs × 2^(failedAttempts − 1)`, capped.
 * - `exponential-jitter`: a random wait between 0 and the exponential value
 *   ("full jitter"), so retries from many callers spread out instead of
 *   arriving in waves.
 */
export function backoffMs(
  policy: RetryPolicy,
  failedAttempts: number,
  random: RandomSource,
): number {
  const exponential = Math.min(
    MAX_BACKOFF_MS,
    policy.baseDelayMs * 2 ** (failedAttempts - 1),
  );
  switch (policy.backoff) {
    case "none":
      return policy.baseDelayMs;
    case "exponential":
      return exponential;
    case "exponential-jitter":
      return random.next() * exponential;
  }
}
