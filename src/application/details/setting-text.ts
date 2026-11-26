import {
  isPreset,
  resolveRetry,
  type ResolvedRetryPolicy,
} from "../../domain/engine/resolve-retry";
import { edgeRetrySchema } from "../../domain/model/edge-settings";
import type { BackoffStrategy } from "../../domain/model/project";
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
  ChoiceFieldDescriptor,
  ChoiceOption,
  DefaultEvidence,
  EvidenceLevel,
  FieldDescriptor,
  FieldKind,
  RetryFieldDescriptor,
} from "./field-descriptor";

/** The kinds whose values read without anything but their descriptor's unit. */
type PlainKind = Exclude<FieldKind, "choice" | "retry">;

/** An edge's retries, as reading them needs: what the preset resolves to there. */
export type ReadableRetryField = Omit<RetryFieldDescriptor, "evidence">;

/**
 * A setting's descriptor, as reading its value needs it: a choice with its
 * options, an edge's retries with what the preset resolves to on it, any
 * other kind with no more than its kind and unit. An edge's setting whose
 * default is unknown has no evidence, so this asks for none.
 */
export type ReadableField =
  | ChoiceFieldDescriptor
  | ReadableRetryField
  | { [K in PlainKind]: FieldDescriptor & { readonly kind: K } }[PlainKind];

/** A setting's value, and the unit to read it in if it's a plain number. */
interface ValueTextInput {
  readonly value: unknown;
  readonly unit: string | undefined;
}

type ValueText = (input: ValueTextInput) => string;

/** How each kind of setting reads its value; a choice reads its options. */
const VALUE_TEXTS: KindHandlers<ReadableField, ValueText> = {
  number: () => numberText,
  "whole-number": () => numberText,
  distribution:
    () =>
    ({ value }) =>
      distributionText(value),
  retry:
    ({ sdkStandard }) =>
    ({ value }) =>
      retryText(value, sdkStandard),
  choice:
    ({ options }) =>
    ({ value }) =>
      choiceText(options, value),
};

/**
 * A setting's value as the Details tab reads it, e.g. "90 connections", or
 * a choice's option label, e.g. "Strongly consistent".
 */
export function settingValueText(field: ReadableField, value: unknown): string {
  return handleKind(VALUE_TEXTS, field)({ value, unit: field.unit });
}

/** One setting's default and its evidence. */
export interface DefaultNoteInput {
  readonly field: ReadableField;
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
  const shown = handleKind(VALUE_TEXTS, field)({ value, unit: undefined });
  const cited =
    evidence.fidelityId === undefined ? "" : ` (${evidence.fidelityId})`;
  return `Default ${shown}: ${LEVEL_WORDS[evidence.level]}${cited}.`;
}

/** "90 connections", or the value as it is if it isn't a number. */
function numberText({ value, unit }: ValueTextInput): string {
  if (typeof value !== "number") return String(value);
  return unit === undefined ? count(value) : `${count(value)} ${unit}`;
}

/**
 * The label of the option `value` is, e.g. "Strongly consistent"; the value
 * as it is if no option has it.
 */
function choiceText(options: readonly ChoiceOption[], value: unknown): string {
  const chosen = options.find((option) => option.value === value);
  return chosen === undefined ? String(value) : chosen.label;
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

/**
 * E.g. "1 attempt, no retries", "3 attempts, 50 ms apart", or "AWS SDK
 * standard: 4 attempts, backing off exponentially, with jitter, from
 * 1,000 ms after a throttle and 25 ms after a transient error". The
 * preset reads as it resolves on the edge.
 */
function retryText(value: unknown, sdkStandard: ResolvedRetryPolicy): string {
  const parsed = edgeRetrySchema.safeParse(value);
  if (!parsed.success) return JSON.stringify(value);
  const retry = parsed.data;
  const policy = resolveRetry({ retry, sdkDefaults: undefined });
  if (!isPreset(retry)) return policyText(policy);
  const maxAttempts = retry.maxAttempts ?? sdkStandard.maxAttempts;
  return `AWS SDK standard: ${policyText({ ...sdkStandard, maxAttempts })}`;
}

/** A resolved policy's attempts and waits; one delay if both kinds share it. */
function policyText({
  maxAttempts,
  backoff,
  baseDelayMs,
}: ResolvedRetryPolicy): string {
  if (maxAttempts === 1) return "1 attempt, no retries";
  const { throttling, transient } = baseDelayMs;
  const delay =
    throttling === transient
      ? `${count(throttling)} ms`
      : `${count(throttling)} ms after a throttle and ${count(transient)} ms after a transient error`;
  return `${count(maxAttempts)} attempts, ${lookup(BACKOFF_TEXTS, backoff)(delay)}`;
}
