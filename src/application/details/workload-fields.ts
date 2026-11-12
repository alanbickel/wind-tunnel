import type { RangedFieldDescriptor } from "./field-descriptor";
import { checkNumberDraft, settingRule, type DraftCheck } from "./number-draft";

// A workload's duration and seed, the two numbers Details edits (UX design
// §2.7). They're the model's and the editor's, not an AWS service's, so
// they have a range and help and no evidence for a default: fidelity.md has
// nothing to say about them. The stored document's schema stays the
// authority for the ranges (`workload-field-ranges.test.ts`, in `adapters/persistence/`, checks that).

/** How long a run lasts. Entered in seconds, held in milliseconds. */
export const DURATION_FIELD: RangedFieldDescriptor = {
  key: "durationSec",
  label: "Duration",
  unit: "s",
  kind: "number",
  range: { min: 0, minExclusive: true, max: undefined },
  help: "How long requests keep arriving, in simulated seconds. The run stops at this time, and requests still in progress then are reported as such.",
};

/** The highest seed: the engine uses only a seed's low 32 bits. */
export const MAX_SEED = 2 ** 32 - 1;

/** What the seed field says when its draft isn't a seed. */
export const SEED_MESSAGE =
  "Seed must be a whole number from 0 to 4,294,967,295.";

/** Where the run's randomness starts. */
export const SEED_FIELD: RangedFieldDescriptor = {
  key: "seed",
  label: "Seed",
  unit: undefined,
  kind: "whole-number",
  range: { min: 0, minExclusive: false, max: MAX_SEED },
  help: "The same seed gives the same run: when requests arrive, which workflow each one is, and how long each step takes. Change it to see how much a result depends on luck.",
};

/**
 * How often a mix entry's workflow runs compared with the others. Relative,
 * so it needn't be a whole number; the schema's only rule is that it's more
 * than 0.
 */
export const WEIGHT_FIELD: RangedFieldDescriptor = {
  key: "weight",
  label: "Weight",
  unit: undefined,
  kind: "number",
  range: { min: 0, minExclusive: true, max: undefined },
  help: "How often this workflow runs compared with the others in the mix. Weights are relative: 80 and 20 mean four requests in five are this workflow's.",
};

/** A weight draft, checked: a number more than 0, fractions allowed. */
export function checkWeightDraft(text: string): DraftCheck<number> {
  return checkNumberDraft(text, settingRule(WEIGHT_FIELD));
}

/** When a profile point applies: seconds from the start, 0 or more. */
export const TIME_FIELD: RangedFieldDescriptor = {
  key: "timeSec",
  label: "Time",
  unit: "s",
  kind: "number",
  range: { min: 0, minExclusive: false, max: undefined },
  help: "When this point applies, in seconds from the start of the run.",
};

/** The target arrival rate at a profile point's time, 0 or more. */
export const RATE_FIELD: RangedFieldDescriptor = {
  key: "requestsPerSec",
  label: "Rate",
  unit: "requests/s",
  kind: "number",
  range: { min: 0, minExclusive: false, max: undefined },
  help: "The target arrival rate at this time. Requests arrive at random, so a given second may get more or fewer. The rate follows a straight line from one point to the next, and holds before the first point and after the last.",
};

/** What the time field says when its draft is below 0. */
export const NEGATIVE_TIME_TEXT = "Time can't be negative.";

/** What the rate field says when its draft is below 0. */
export const NEGATIVE_RATE_TEXT = "Rate can't be negative.";

/** What a time field says when another point is at the time typed. */
export function timeTakenText(timeSec: number): string {
  return `Another point is already at ${String(timeSec)} s.`;
}

/** A draft that must be 0 or more, and what it says when it's below 0. */
interface NonNegativeInput {
  readonly text: string;
  readonly field: RangedFieldDescriptor;
  readonly negativeText: string;
}

/** A number draft that must be 0 or more; below 0 says `negativeText`. */
function checkNonNegativeDraft({
  text,
  field,
  negativeText,
}: NonNegativeInput): DraftCheck<number> {
  // The range is left open below, so a negative number reaches the one
  // sentence this field says for it.
  const range = {
    min: Number.NEGATIVE_INFINITY,
    minExclusive: false,
    max: undefined,
  };
  const check = checkNumberDraft(text, { ...settingRule(field), range });
  if (check.status === "fails" || check.value >= 0) return check;
  return { status: "fails", message: negativeText };
}

/** A rate draft, checked: a number, 0 or more. */
export function checkRateDraft(text: string): DraftCheck<number> {
  return checkNonNegativeDraft({
    text,
    field: RATE_FIELD,
    negativeText: NEGATIVE_RATE_TEXT,
  });
}

/** A point's time and the times of the other points. */
export interface TimeDraftInput {
  readonly text: string;
  /** The other points' times, in seconds. */
  readonly otherTimesSec: readonly number[];
}

/**
 * A time draft, in seconds, checked: a number, 0 or more, and not another
 * point's time, because a line can't have two rates at one moment. A passing
 * check holds the seconds typed.
 */
export function checkTimeDraft({
  text,
  otherTimesSec,
}: TimeDraftInput): DraftCheck<number> {
  const check = checkNonNegativeDraft({
    text,
    field: TIME_FIELD,
    negativeText: NEGATIVE_TIME_TEXT,
  });
  if (check.status === "fails") return check;
  const timeMs = durationMsOf(check.value);
  const taken = otherTimesSec.some((other) => durationMsOf(other) === timeMs);
  if (!taken) return check;
  return { status: "fails", message: timeTakenText(check.value) };
}

/**
 * Seconds as the stored milliseconds. Rounded to 12 significant digits, so
 * the drift of a product such as 1.005 × 1000 (1004.9999999999999) doesn't
 * reach the project, and the field shows what was typed.
 */
export function durationMsOf(durationSec: number): number {
  return Number((durationSec * 1000).toPrecision(12));
}

/**
 * A duration draft, in seconds, checked: a number more than 0, fractions
 * allowed. A passing check holds the seconds typed; `durationMsOf` makes
 * them the stored value.
 */
export function checkDurationDraft(text: string): DraftCheck<number> {
  const rule = { ...settingRule(DURATION_FIELD), limitSuffix: " s" };
  return checkNumberDraft(text, rule);
}

/**
 * A seed draft, checked: a whole number from 0 to 4,294,967,295. Whatever
 * is wrong with it, the message is the one sentence that says the range.
 */
export function checkSeedDraft(text: string): DraftCheck<number> {
  const check = checkNumberDraft(text, settingRule(SEED_FIELD));
  if (check.status === "passes") return check;
  return { status: "fails", message: SEED_MESSAGE };
}
