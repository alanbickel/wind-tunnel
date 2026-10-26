import type { BackoffStrategy, RetryPolicy } from "../../domain/model/project";
import {
  distributionSchema,
  type Distribution,
} from "../../domain/random/distribution";
import {
  handleKind,
  lookup,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import { count } from "../run-analysis/number-format";
import type {
  DefaultEvidence,
  EvidenceLevel,
  FieldDescriptor,
  FieldKind,
} from "./field-descriptor";

/** A setting's value, and the unit to read it in if it's a plain number. */
interface ValueTextInput {
  readonly value: unknown;
  readonly unit: string | undefined;
}

type ValueText = (input: ValueTextInput) => string;

const VALUE_TEXTS: Readonly<Record<FieldKind, ValueText>> = {
  number: numberText,
  "whole-number": numberText,
  distribution: ({ value }) => distributionText(value),
  retry: ({ value }) => retryText(value as RetryPolicy),
};

/** A setting's value as the Details tab reads it, e.g. "90 connections". */
export function settingValueText(
  field: FieldDescriptor,
  value: unknown,
): string {
  return lookup(VALUE_TEXTS, field.kind)({ value, unit: field.unit });
}

/** One setting's default and its evidence. */
export interface DefaultNoteInput {
  readonly field: FieldDescriptor;
  readonly value: unknown;
  readonly evidence: DefaultEvidence;
}

const LEVEL_WORDS: Readonly<Record<EvidenceLevel, string>> = {
  documented: "documented",
  observed: "observed",
  assumption: "an assumption",
};

/** E.g. "Default 16: an assumption (RDS-2)." A number's unit is left out. */
export function defaultNote({
  field,
  value,
  evidence,
}: DefaultNoteInput): string {
  const shown = lookup(VALUE_TEXTS, field.kind)({ value, unit: undefined });
  const cited =
    evidence.fidelityId === undefined ? "" : ` (${evidence.fidelityId})`;
  return `Default ${shown}: ${LEVEL_WORDS[evidence.level]}${cited}.`;
}

/** "90 connections", or the value as it is if it isn't a number. */
function numberText({ value, unit }: ValueTextInput): string {
  if (typeof value !== "number") return String(value);
  return unit === undefined ? count(value) : `${count(value)} ${unit}`;
}

const DISTRIBUTION_TEXTS: KindHandlers<Distribution, string> = {
  constant: ({ valueMs }) => `constant, ${count(valueMs)} ms`,
  exponential: ({ meanMs }) => `exponential, mean ${count(meanMs)} ms`,
  lognormal: ({ medianMs, p99Ms }) =>
    `lognormal, median ${count(medianMs)} ms, p99 ${count(p99Ms)} ms`,
};

/** E.g. "lognormal, median 15 ms, p99 60 ms". Every distribution is in ms. */
function distributionText(value: unknown): string {
  const parsed = distributionSchema.safeParse(value);
  if (!parsed.success) return JSON.stringify(value);
  return handleKind(DISTRIBUTION_TEXTS, parsed.data);
}

const BACKOFF_TEXTS: Readonly<
  Record<BackoffStrategy, (delay: string) => string>
> = {
  none: (delay) => `${delay} apart`,
  exponential: (delay) => `backing off exponentially from ${delay}`,
  "exponential-jitter": (delay) =>
    `backing off exponentially, with jitter, from ${delay}`,
};

/** E.g. "1 attempt: no retries", or "3 attempts, 50 ms apart". */
function retryText({ maxAttempts, backoff, baseDelayMs }: RetryPolicy): string {
  if (maxAttempts === 1) return "1 attempt: no retries";
  const delay = `${count(baseDelayMs)} ms`;
  return `${count(maxAttempts)} attempts, ${lookup(BACKOFF_TEXTS, backoff)(delay)}`;
}
