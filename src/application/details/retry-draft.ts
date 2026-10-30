import { retryPolicySchema } from "../../domain/model/edge-settings";
import type { BackoffStrategy, RetryPolicy } from "../../domain/model/project";
import { checkNumberDraft, numberDraft, type NumberRule } from "./number-draft";

/** A retry policy's number, by its key in `RetryPolicy`. */
export type RetryPartKey = "maxAttempts" | "baseDelayMs";

/** One number of a retry policy, as its own field reads it. */
export interface RetryPart {
  readonly key: RetryPartKey;
  /** Shown beside the field, e.g. "Attempts". */
  readonly label: string;
  /** Shown after the field, e.g. "ms"; undefined for a count. */
  readonly unit: string | undefined;
  /** How a message names it, and the values `retryPolicySchema` allows. */
  readonly rule: NumberRule;
}

/** A retry policy's numbers, in the order its field shows them. */
export const RETRY_PARTS: readonly RetryPart[] = [
  {
    key: "maxAttempts",
    label: "Attempts",
    unit: undefined,
    rule: {
      subject: "Attempts",
      wholeNumber: true,
      range: { min: 1, minExclusive: false, max: 10 },
    },
  },
  {
    key: "baseDelayMs",
    label: "Base delay",
    unit: "ms",
    rule: {
      subject: "The base delay",
      wholeNumber: false,
      range: { min: 0, minExclusive: false, max: undefined },
    },
  },
];

/** A backoff the picker offers, and how it reads. */
export interface BackoffChoice {
  readonly value: BackoffStrategy;
  readonly label: string;
}

/** The backoffs, in the picker's order. */
export const BACKOFF_CHOICES: readonly BackoffChoice[] = [
  { value: "none", label: "none: the same delay each time" },
  { value: "exponential", label: "exponential" },
  { value: "exponential-jitter", label: "exponential, with jitter" },
];

/** What's typed into a retry field: each number's text, and the backoff. */
export interface RetryDraft {
  readonly texts: Readonly<Record<RetryPartKey, string>>;
  readonly backoff: BackoffStrategy;
}

/** A retry draft, once checked: the policy, or what's wrong. */
export type RetryCheck = RetryPasses | RetryFails;

export interface RetryPasses {
  readonly status: "passes";
  readonly value: RetryPolicy;
}

export interface RetryFails {
  readonly status: "fails";
  /** A message for each number that fails, keyed by its key. */
  readonly messages: Readonly<Partial<Record<RetryPartKey, string>>>;
}

/**
 * A stored retry policy as its field shows it to edit. A value that isn't
 * one, which a saved project can't hold, shows as one attempt.
 */
export function retryDraft(value: unknown): RetryDraft {
  const parsed = retryPolicySchema.safeParse(value);
  const policy: RetryPolicy = parsed.success
    ? parsed.data
    : { maxAttempts: 1, backoff: "none", baseDelayMs: 0 };
  return {
    texts: {
      maxAttempts: numberDraft(policy.maxAttempts),
      baseDelayMs: numberDraft(policy.baseDelayMs),
    },
    backoff: policy.backoff,
  };
}

/** Checks each number against its rule, then the schema, which stays the authority. */
export function checkRetryDraft(draft: RetryDraft): RetryCheck {
  const checks = RETRY_PARTS.map((part) => ({
    key: part.key,
    check: checkNumberDraft(draft.texts[part.key], part.rule),
  }));
  const failed = checks.flatMap(({ key, check }) =>
    check.status === "fails" ? [[key, check.message] as const] : [],
  );
  if (failed.length > 0) {
    return { status: "fails", messages: Object.fromEntries(failed) };
  }
  const numbers = Object.fromEntries(
    checks.map(({ key, check }) => [
      key,
      check.status === "passes" ? check.value : undefined,
    ]),
  );
  const parsed = retryPolicySchema.safeParse({
    ...numbers,
    backoff: draft.backoff,
  });
  if (parsed.success) return { status: "passes", value: parsed.data };
  // Reached only if a part's rule disagrees with the schema, which
  // field-ranges.test.ts ("each retry part's range") rules out.
  return { status: "fails", messages: { maxAttempts: parsed.error.message } };
}
