import type { BackoffStrategy, RetryPolicy } from "../model/project";
import type { RandomSource } from "../random/random-source";
import { lookup } from "../shared/kind-handlers";

/** Longest wait between attempts; the AWS SDKs cap backoff at 20 s. */
export const MAX_BACKOFF_MS = 20_000;

export interface BackoffInput {
  readonly policy: RetryPolicy;
  /** Failures so far: 1 before the first retry. */
  readonly failedAttempts: number;
  /** Draws the jitter for `exponential-jitter`. */
  readonly random: RandomSource;
}

interface BackoffRuleInput {
  readonly policy: RetryPolicy;
  /** `baseDelayMs × 2^(failedAttempts − 1)`, capped at `MAX_BACKOFF_MS`. */
  readonly exponentialMs: number;
  readonly random: RandomSource;
}

type BackoffRule = (input: BackoffRuleInput) => number;

/**
 * - `none`: always `baseDelayMs`.
 * - `exponential`: the exponential wait.
 * - `exponential-jitter`: a random wait between 0 and the exponential one
 *   ("full jitter"), so retries from many callers spread out instead of
 *   arriving in waves.
 */
const BACKOFF_RULES: Readonly<Record<BackoffStrategy, BackoffRule>> = {
  none: ({ policy }) => policy.baseDelayMs,
  exponential: ({ exponentialMs }) => exponentialMs,
  "exponential-jitter": ({ exponentialMs, random }) =>
    random.next() * exponentialMs,
};

/** How long to wait before the next attempt, by the policy's `backoff` rule. */
export function backoffMs({
  policy,
  failedAttempts,
  random,
}: BackoffInput): number {
  const exponentialMs = Math.min(
    MAX_BACKOFF_MS,
    policy.baseDelayMs * 2 ** (failedAttempts - 1),
  );
  return lookup(
    BACKOFF_RULES,
    policy.backoff,
  )({
    policy,
    exponentialMs,
    random,
  });
}
