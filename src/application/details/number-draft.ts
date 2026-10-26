import { count } from "../run-analysis/number-format";
import type { FieldRange, NumberFieldDescriptor } from "./field-descriptor";

// A field holds what's typed as a draft until it passes the field's checks
// (UX design §4.3). These check a draft, and word what's wrong with it as a
// user reads it: "Query workers must be at least 1.", not Zod's "Too small:
// expected number to be >=1".

/** What a draft is, once checked: the value it stands for, or what's wrong. */
export type DraftCheck<T> = DraftPasses<T> | DraftFails;

export interface DraftPasses<T> {
  readonly status: "passes";
  readonly value: T;
}

export interface DraftFails {
  readonly status: "fails";
  /** A sentence for the user, e.g. "Query workers must be at least 1." */
  readonly message: string;
}

/** What a number must be, and how its messages name it. */
export interface NumberRule {
  /** Starts each message, e.g. "Query workers" or "The median". */
  readonly subject: string;
  readonly wholeNumber: boolean;
  readonly range: FieldRange;
}

/** The message if `value` breaks one rule, or undefined. */
type RangeCheck = (value: number, rule: NumberRule) => string | undefined;

/** Each rule a number must keep, in the order they're checked. */
const RANGE_CHECKS: readonly RangeCheck[] = [
  (value, { subject, wholeNumber }) =>
    wholeNumber && !Number.isInteger(value)
      ? `${subject} must be a whole number.`
      : undefined,
  (value, { subject, range }) =>
    range.minExclusive && value <= range.min
      ? `${subject} must be more than ${count(range.min)}.`
      : undefined,
  (value, { subject, range }) =>
    !range.minExclusive && value < range.min
      ? `${subject} must be at least ${count(range.min)}.`
      : undefined,
  (value, { subject, range }) =>
    range.max !== undefined && value > range.max
      ? `${subject} must be at most ${count(range.max)}.`
      : undefined,
];

/**
 * A number field's draft, checked against its rule. It may have thousands
 * separators ("10,000") and spaces around it. A comma anywhere else, such
 * as a decimal comma ("1,5"), makes it not a number, rather than a number
 * ten times too big.
 */
export function checkNumberDraft(
  text: string,
  rule: NumberRule,
): DraftCheck<number> {
  const value = parseNumber(text);
  if (value === undefined) {
    const what = rule.wholeNumber ? "a whole number" : "a number";
    return { status: "fails", message: `${rule.subject} must be ${what}.` };
  }
  const message = RANGE_CHECKS.map((check) => check(value, rule)).find(
    (found) => found !== undefined,
  );
  if (message !== undefined) return { status: "fails", message };
  return { status: "passes", value };
}

/** Digits with commas between groups of three, e.g. "-10,000.5". */
const GROUPED_NUMBER = /^-?\d{1,3}(,\d{3})+(\.\d*)?$/;

/** The number typed, or undefined if it isn't one. */
function parseNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed.includes(",") && !GROUPED_NUMBER.test(trimmed)) return undefined;
  const plain = trimmed.replaceAll(",", "");
  if (plain === "") return undefined;
  const value = Number(plain);
  return Number.isFinite(value) ? value : undefined;
}

/** A number setting's rule, from its descriptor. */
export function settingRule(field: NumberFieldDescriptor): NumberRule {
  return {
    subject: field.label,
    wholeNumber: field.kind === "whole-number",
    range: field.range,
  };
}

/** A number as a field shows it to edit: no separators, e.g. "10000". */
export function numberDraft(value: unknown): string {
  return typeof value === "number" ? String(value) : "";
}
