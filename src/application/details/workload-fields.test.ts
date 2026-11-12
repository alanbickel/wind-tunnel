import { describe, expect, it } from "vitest";
import {
  checkDurationDraft,
  checkSeedDraft,
  durationMsOf,
  DURATION_FIELD,
  SEED_FIELD,
  SEED_MESSAGE,
} from "./workload-fields";

/** The message for a draft, or undefined if it passes. */
function messageOf(check: ReturnType<typeof checkSeedDraft>) {
  return check.status === "fails" ? check.message : undefined;
}

describe("checkDurationDraft", () => {
  // Fails if a duration over 0, fractions included, is refused, or the
  // number comes back in anything but the seconds typed.
  it.each([
    ["45", 45],
    ["0.5", 0.5],
    [" 1,000 ", 1_000],
  ])("reads %j as %d seconds", (text, seconds) => {
    expect(checkDurationDraft(text)).toEqual({
      status: "passes",
      value: seconds,
    });
  });

  // Fails if 0, a negative, or a non-number passes, or the message isn't
  // the one the design words.
  it.each([
    ["0", "Duration must be more than 0 s."],
    ["-5", "Duration must be more than 0 s."],
    ["soon", "Duration must be a number."],
  ])("refuses %j with its message", (text, message) => {
    expect(messageOf(checkDurationDraft(text))).toBe(message);
  });

  // Fails if there's an upper limit: a long run is the user's to ask for.
  it("has no upper limit", () => {
    expect(checkDurationDraft("1000000").status).toBe("passes");
  });
});

describe("checkSeedDraft", () => {
  // Fails if either end of the range, or a number between, is refused.
  it.each([0, 42, 4_294_967_295])("accepts %d", (seed) => {
    expect(checkSeedDraft(String(seed))).toEqual({
      status: "passes",
      value: seed,
    });
  });

  // Fails if a seed the engine can't use passes, or any of them says
  // something other than the one sentence that gives the range.
  it.each(["4294967296", "5,000,000,000", "-1", "1.5", "", "lucky"])(
    "refuses %j with the range",
    (text) => {
      expect(messageOf(checkSeedDraft(text))).toBe(SEED_MESSAGE);
    },
  );
});

describe("durationMsOf", () => {
  // Fails if the product's floating-point drift reaches the project:
  // 1.005 x 1000 is 1004.9999999999999 before it's rounded.
  it.each([
    [45, 45_000],
    [0.5, 500],
    [1.005, 1_005],
    [0.0004, 0.4],
  ])("turns %d s into %d ms", (seconds, ms) => {
    expect(durationMsOf(seconds)).toBe(ms);
  });
});

describe("the fields' words", () => {
  // Fails if a label, the unit, or either help text changes from the issue's words.
  it("say what the design says", () => {
    expect(DURATION_FIELD.label).toBe("Duration");
    expect(DURATION_FIELD.unit).toBe("s");
    expect(DURATION_FIELD.help).toBe(
      "How long requests keep arriving, in simulated seconds. The run stops at this time, and requests still in progress then are reported as such.",
    );
    expect(SEED_FIELD.label).toBe("Seed");
    expect(SEED_FIELD.help).toBe(
      "The same seed gives the same run: when requests arrive, which workflow each one is, and how long each step takes. Change it to see how much a result depends on luck.",
    );
  });
});
