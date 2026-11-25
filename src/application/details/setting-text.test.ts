import { describe, expect, it } from "vitest";
import {
  AWS_SDK_STANDARD,
  resolveRetry,
} from "../../domain/engine/resolve-retry";
import type {
  ChoiceFieldDescriptor,
  DefaultEvidence,
  DistributionFieldDescriptor,
  NumberFieldDescriptor,
  RetryFieldDescriptor,
} from "./field-descriptor";
import { defaultNote, settingValueText } from "./setting-text";

const ASSUMED: DefaultEvidence = { level: "assumption", fidelityId: undefined };

const queryTime: DistributionFieldDescriptor = {
  key: "queryTime",
  label: "Query time",
  unit: "ms",
  kind: "distribution",
  help: "",
  evidence: ASSUMED,
};

const retry: RetryFieldDescriptor = {
  key: "retry",
  label: "Retries",
  unit: undefined,
  kind: "retry",
  help: "",
  evidence: ASSUMED,
  sdkStandard: AWS_SDK_STANDARD,
};

/** The same field on an edge into DynamoDB, whose clients make 4 attempts. */
const retryIntoDynamoDb: RetryFieldDescriptor = {
  ...retry,
  sdkStandard: resolveRetry({
    retry: { preset: "aws-sdk-standard" },
    sdkDefaults: { maxAttempts: 4, transientBaseDelayMs: 25 },
  }),
};

const workers: NumberFieldDescriptor = {
  key: "queryWorkers",
  label: "Query workers",
  unit: "queries",
  kind: "whole-number",
  help: "",
  range: { min: 1, minExclusive: false, max: undefined },
  evidence: ASSUMED,
};

const consistency: ChoiceFieldDescriptor = {
  key: "consistency",
  label: "Consistency",
  unit: undefined,
  kind: "choice",
  options: [
    { value: "eventual", label: "Eventually consistent" },
    { value: "strong", label: "Strongly consistent" },
  ],
  help: "",
  evidence: ASSUMED,
};

describe("settingValueText", () => {
  // Fails if a distribution kind loses its own words, or its values their
  // unit, or a distribution that doesn't parse throws.
  it.each([
    [{ kind: "constant", valueMs: 5 }, "constant, 5 ms"],
    [{ kind: "exponential", meanMs: 1_500 }, "exponential, mean 1,500 ms"],
    [
      { kind: "lognormal", medianMs: 15, p99Ms: 60 },
      "lognormal, median 15 ms, p99 60 ms",
    ],
    [{ kind: "gamma" }, '{"kind":"gamma"}'],
  ])("reads distribution %j as %s", (value, text) => {
    expect(settingValueText(queryTime, value)).toBe(text);
  });

  // Fails if a retry policy with one attempt reads as retrying, or a
  // backoff kind loses its own words.
  it.each([
    [
      { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
      "1 attempt, no retries",
    ],
    [
      { maxAttempts: 3, backoff: "none", baseDelayMs: 50 },
      "3 attempts, 50 ms apart",
    ],
    [
      { maxAttempts: 4, backoff: "exponential-jitter", baseDelayMs: 25 },
      "4 attempts, backing off exponentially, with jitter, from 25 ms",
    ],
  ])("reads retry policy %j as %s", (value, text) => {
    expect(settingValueText(retry, value)).toBe(text);
  });

  // Fails if the preset reads without the values it resolves to on the
  // edge (its target's, then the edge's own attempts), or a custom policy
  // reads as the preset.
  it.each([
    [
      { preset: "aws-sdk-standard" },
      "AWS SDK standard: 3 attempts, backing off exponentially, with jitter, from 1,000 ms after a throttle and 50 ms after a transient error",
      retry,
    ],
    [
      { preset: "aws-sdk-standard" },
      "AWS SDK standard: 4 attempts, backing off exponentially, with jitter, from 1,000 ms after a throttle and 25 ms after a transient error",
      retryIntoDynamoDb,
    ],
    [
      { preset: "aws-sdk-standard", maxAttempts: 1 },
      "AWS SDK standard: 1 attempt, no retries",
      retryIntoDynamoDb,
    ],
    [
      { maxAttempts: 2, backoff: "none", baseDelayMs: 10 },
      "2 attempts, 10 ms apart",
      retryIntoDynamoDb,
    ],
  ])("reads retries %j as %s", (value, text, field) => {
    expect(settingValueText(field, value)).toBe(text);
  });

  // Fails if a number loses its thousands separator or its unit.
  it("reads a number with its unit", () => {
    expect(settingValueText(workers, 1_000)).toBe("1,000 queries");
  });

  // Fails if a choice reads as its stored value rather than its option's
  // label, or a value no option has throws instead of showing as it is.
  it.each([
    ["strong", "Strongly consistent"],
    ["eventual", "Eventually consistent"],
    ["linear", "linear"],
  ])("reads choice %s as %s", (value, text) => {
    expect(settingValueText(consistency, value)).toBe(text);
  });
});

describe("defaultNote", () => {
  // Fails if the note shows the number's unit, misses the entry, or words
  // a level other than as the UX design quotes it.
  it("says the default, how sure it is, and its fidelity entry", () => {
    expect(
      defaultNote({
        field: workers,
        value: 16,
        evidence: { level: "assumption", fidelityId: "RDS-2" },
      }),
    ).toBe("Default 16: an assumption (RDS-2).");
    expect(
      defaultNote({
        field: workers,
        value: 600,
        evidence: { level: "observed", fidelityId: undefined },
      }),
    ).toBe("Default 600: observed.");
  });

  // Fails if a choice's default note shows its stored value, not its label.
  it("says a choice's default by its option's label", () => {
    expect(
      defaultNote({ field: consistency, value: "eventual", evidence: ASSUMED }),
    ).toBe("Default Eventually consistent: an assumption.");
  });
});
