import type { RetryableKind } from "../components/error-kind";
import type { SdkRetryDefaults } from "../components/sdk-retry-defaults";
import type {
  BackoffStrategy,
  EdgeRetry,
  RetryPolicy,
  RetryPreset,
} from "../model/project";

/**
 * An edge's retries as the engine runs them (ADR-0025 decision 2.3):
 * attempts, a backoff, and a base delay for each retryable kind. A custom
 * policy and the preset both resolve to it.
 */
export interface ResolvedRetryPolicy {
  /** Total attempts, including the first. 1 means no retries. */
  readonly maxAttempts: number;
  readonly backoff: BackoffStrategy;
  /** The delay `backoffMs` grows from, after a failure of each kind. */
  readonly baseDelayMs: Readonly<Record<RetryableKind, number>>;
}

/**
 * The AWS SDKs' standard mode: 3 attempts, full jitter, and a base delay of
 * 1,000 ms after a throttle and 50 ms after a transient error; the 20 s cap
 * is `MAX_BACKOFF_MS` (ADR-0025 decision 3.2; fidelity ENG-2).
 */
export const AWS_SDK_STANDARD: ResolvedRetryPolicy = {
  maxAttempts: 3,
  backoff: "exponential-jitter",
  baseDelayMs: { throttling: 1_000, transient: 50 },
};

/** An edge's retries, and how its target's SDK client differs from standard. */
export interface ResolveRetryInput {
  readonly retry: EdgeRetry;
  /** The target type's `sdkRetryDefaults`; undefined if it has none. */
  readonly sdkDefaults: SdkRetryDefaults | undefined;
}

/**
 * An edge's retries resolved for a run: a custom policy's one base delay
 * for both kinds; the preset's values, with the target type's
 * `sdkRetryDefaults` over them and the edge's own `maxAttempts` over both.
 */
export function resolveRetry({
  retry,
  sdkDefaults,
}: ResolveRetryInput): ResolvedRetryPolicy {
  if (isPreset(retry)) return resolvePreset(retry, sdkDefaults);
  return resolveCustom(retry);
}

/** True for the preset, which a custom policy can't be: it has no `backoff`. */
export function isPreset(retry: EdgeRetry): retry is RetryPreset {
  return "preset" in retry;
}

/** One base delay for both kinds, so it runs as it did before ADR-0025. */
function resolveCustom({
  maxAttempts,
  backoff,
  baseDelayMs,
}: RetryPolicy): ResolvedRetryPolicy {
  return {
    maxAttempts,
    backoff,
    baseDelayMs: { throttling: baseDelayMs, transient: baseDelayMs },
  };
}

function resolvePreset(
  preset: RetryPreset,
  sdkDefaults: SdkRetryDefaults | undefined,
): ResolvedRetryPolicy {
  const standard = AWS_SDK_STANDARD;
  return {
    maxAttempts:
      preset.maxAttempts ?? sdkDefaults?.maxAttempts ?? standard.maxAttempts,
    backoff: standard.backoff,
    baseDelayMs: {
      throttling: standard.baseDelayMs.throttling,
      transient:
        sdkDefaults?.transientBaseDelayMs ?? standard.baseDelayMs.transient,
    },
  };
}
