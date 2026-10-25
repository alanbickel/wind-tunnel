import { describe, expect, it } from "vitest";
import type { FieldDescriptor } from "./field-descriptor";
import { defaultNote, settingValueText } from "./setting-text";

const queryTime: FieldDescriptor = {
  key: "queryTime",
  label: "Query time",
  unit: "ms",
  kind: "distribution",
  help: "",
};

const retry: FieldDescriptor = {
  key: "retry",
  label: "Retries",
  unit: undefined,
  kind: "retry",
  help: "",
};

const workers: FieldDescriptor = {
  key: "queryWorkers",
  label: "Query workers",
  unit: "queries",
  kind: "whole-number",
  help: "",
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
      "1 attempt: no retries",
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

  // Fails if a number loses its thousands separator or its unit.
  it("reads a number with its unit", () => {
    expect(settingValueText(workers, 1_000)).toBe("1,000 queries");
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
});
