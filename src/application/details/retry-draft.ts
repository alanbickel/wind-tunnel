import {
  isPreset,
  type ResolvedRetryPolicy,
} from "../../domain/engine/resolve-retry";
import {
  edgeRetrySchema,
  retryPolicySchema,
} from "../../domain/model/edge-settings";
import type {
  BackoffStrategy,
  EdgeRetry,
  RetryPolicy,
  RetryPresetName,
} from "../../domain/model/project";
import { count } from "../run-analysis/number-format";
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

/**
 * How each backoff reads in the picker. A strategy added to
 * `BackoffStrategy` without a label fails typecheck here.
 */
const BACKOFF_LABELS: Readonly<Record<BackoffStrategy, string>> = {
  none: "none: the same delay each time",
  exponential: "exponential",
  "exponential-jitter": "exponential, with jitter",
};

/** The backoffs, in the schema's order. */
export const BACKOFF_CHOICES: readonly BackoffChoice[] =
  retryPolicySchema.shape.backoff.options.map((value) => ({
    value,
    label: BACKOFF_LABELS[value],
  }));

/** Whether an edge follows the AWS SDK standard preset or its own policy. */
export type RetryMode = RetryPresetName | "custom";

/** A mode the picker offers, and how it reads. */
export interface RetryModeChoice {
  readonly value: RetryMode;
  readonly label: string;
}

/** The modes, the preset first, named as ADR-0025 decision 5 names them. */
export const RETRY_MODE_CHOICES: readonly RetryModeChoice[] = [
  { value: "aws-sdk-standard", label: "AWS SDK standard" },
  { value: "custom", label: "Custom" },
];

/**
 * What's typed into a retry field: its mode, each number's text, and the
 * backoff. In the preset's mode, the backoff and the base delay show what
 * the preset waits after a throttle; changing either makes it custom.
 */
export interface RetryDraft {
  readonly mode: RetryMode;
  readonly texts: Readonly<Record<RetryPartKey, string>>;
  readonly backoff: BackoffStrategy;
}

/** A retry draft, once checked: the edge's retries, or what's wrong. */
export type RetryCheck = RetryPasses | RetryFails;

export interface RetryPasses {
  readonly status: "passes";
  /** A custom policy, or the preset with any attempts of the edge's own. */
  readonly value: EdgeRetry;
}

export interface RetryFails {
  readonly status: "fails";
  /** A message for each number that fails, keyed by its key. */
  readonly messages: Readonly<Partial<Record<RetryPartKey, string>>>;
}

/** A draft checked as a custom policy, before its mode is applied. */
type RetryPolicyCheck = RetryPolicyPasses | RetryFails;

interface RetryPolicyPasses {
  readonly status: "passes";
  readonly value: RetryPolicy;
}

/** What a stored value that isn't retries shows as; a saved project can't hold one. */
const ONE_ATTEMPT: RetryPolicy = {
  maxAttempts: 1,
  backoff: "none",
  baseDelayMs: 0,
};

/**
 * An edge's stored retries as its field shows them to edit. The preset
 * shows what it resolves to on the edge (`sdkStandard`): its attempts,
 * unless the edge sets its own, its backoff, and its base delay after a
 * throttle.
 */
export function retryDraft(
  value: unknown,
  sdkStandard: ResolvedRetryPolicy,
): RetryDraft {
  const parsed = edgeRetrySchema.safeParse(value);
  const retry = parsed.success ? parsed.data : ONE_ATTEMPT;
  if (!isPreset(retry)) return { mode: "custom", ...policyDraft(retry) };
  const { backoff, baseDelayMs } = sdkStandard;
  return {
    mode: retry.preset,
    ...policyDraft({
      maxAttempts: retry.maxAttempts ?? sdkStandard.maxAttempts,
      backoff,
      baseDelayMs: baseDelayMs.throttling,
    }),
  };
}

/** A custom policy's numbers as typed text, and its backoff. */
function policyDraft(policy: RetryPolicy): Omit<RetryDraft, "mode"> {
  return {
    texts: {
      maxAttempts: numberDraft(policy.maxAttempts),
      baseDelayMs: numberDraft(policy.baseDelayMs),
    },
    backoff: policy.backoff,
  };
}

/** A mode picked for a draft, and what the preset resolves to on its edge. */
export interface PickModeInput {
  readonly mode: RetryMode;
  readonly sdkStandard: ResolvedRetryPolicy;
}

/**
 * The draft once a mode is picked. Custom starts from what the field
 * shows: the preset's attempts, its backoff, and its base delay after a
 * throttle. The preset starts afresh, with the attempts its target gives.
 */
export function withMode(
  draft: RetryDraft,
  { mode, sdkStandard }: PickModeInput,
): RetryDraft {
  if (mode === "custom") return { ...draft, mode };
  return retryDraft({ preset: mode }, sdkStandard);
}

/** The draft with a new backoff: the preset has its own, so it's custom. */
export function withBackoff(
  draft: RetryDraft,
  backoff: BackoffStrategy,
): RetryDraft {
  return { ...draft, mode: "custom", backoff };
}

/** One number's new text, by its key. */
export interface PartTextInput {
  readonly key: RetryPartKey;
  readonly text: string;
}

/**
 * Whether the preset stays when a number changes: new attempts keep it, a
 * new base delay makes it custom (ADR-0025 decision 3.4).
 */
const KEEPS_PRESET: Readonly<Record<RetryPartKey, boolean>> = {
  maxAttempts: true,
  baseDelayMs: false,
};

/** The draft with one number's new text; a new base delay makes it custom. */
export function withPartText(
  draft: RetryDraft,
  { key, text }: PartTextInput,
): RetryDraft {
  const texts = { ...draft.texts, [key]: text };
  if (KEEPS_PRESET[key]) return { ...draft, texts };
  return { ...draft, mode: "custom", texts };
}

/**
 * What the preset waits on its edge, which its numbers alone don't say,
 * e.g. "Waits from 1,000 ms after a throttle and from 25 ms after a
 * transient error, …".
 */
export function presetNote({ baseDelayMs }: ResolvedRetryPolicy): string {
  const { throttling, transient } = baseDelayMs;
  return `Waits from ${count(throttling)} ms after a throttle and from ${count(transient)} ms after a transient error. A new backoff or base delay makes it custom, with one base delay for both.`;
}

/**
 * Checks each number against its rule, then the schema, which stays the
 * authority. The preset keeps attempts of its own only where they differ
 * from what it resolves to on the edge, so it otherwise follows its
 * target's type.
 */
export function checkRetryDraft(
  draft: RetryDraft,
  sdkStandard: ResolvedRetryPolicy,
): RetryCheck {
  const checked = checkPolicyDraft(draft);
  if (checked.status === "fails" || draft.mode === "custom") return checked;
  const preset = draft.mode;
  const { maxAttempts } = checked.value;
  if (maxAttempts === sdkStandard.maxAttempts) {
    return { status: "passes", value: { preset } };
  }
  return { status: "passes", value: { preset, maxAttempts } };
}

/** The draft's numbers and backoff as a custom policy, or what's wrong. */
function checkPolicyDraft(draft: RetryDraft): RetryPolicyCheck {
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
