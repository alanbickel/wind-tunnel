import type { RetryableKind } from "../components/error-kind";
import type { BackoffStrategy } from "../model/project";
import type { RandomSource } from "../random/random-source";
import { lookup } from "../shared/kind-handlers";
import type { ResolvedRetryPolicy } from "./resolve-retry";

/** Longest wait between attempts; the AWS SDKs cap backoff at 20 s. */
export const MAX_BACKOFF_MS = 20_000;

export interface BackoffInput {
  readonly policy: ResolvedRetryPolicy;
  /** The failed attempt's kind, which picks the policy's base delay. */
  readonly kind: RetryableKind;
  /** Failures so far: 1 before the first retry. */
  readonly failedAttempts: number;
  /** Draws the jitter for `exponential-jitter`. */
  readonly random: RandomSource;
}

interface BackoffRuleInput {
  /** The policy's base delay for the failure's kind. */
  readonly baseDelayMs: number;
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
  none: ({ baseDelayMs }) => baseDelayMs,
  exponential: ({ exponentialMs }) => exponentialMs,
  "exponential-jitter": ({ exponentialMs, random }) =>
    random.next() * exponentialMs,
};

/**
 * How long to wait before the next attempt, by the policy's `backoff`
 * rule, from its base delay for the failure's kind (ADR-0025 decision 2.3).
 */
export function backoffMs({
  policy,
  kind,
  failedAttempts,
  random,
}: BackoffInput): number {
  const baseDelayMs = policy.baseDelayMs[kind];
  const exponentialMs = Math.min(
    MAX_BACKOFF_MS,
    baseDelayMs * 2 ** (failedAttempts - 1),
  );
  return lookup(
    BACKOFF_RULES,
    policy.backoff,
  )({
    baseDelayMs,
    exponentialMs,
    random,
  });
}
