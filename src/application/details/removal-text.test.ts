import { describe, expect, it } from "vitest";
import { stepRemovalText } from "./removal-text";

describe("stepRemovalText", () => {
  // Fails if a step with nothing under it is asked about, so it doesn't
  // go at once, or a step with steps under it isn't, or the count is wrong
  // or reads "1 calls".
  it("asks only about a step with steps under it, and counts them", () => {
    const label = "fn-orders · invoke";

    expect(stepRemovalText({ label, stepsBelow: 0 })).toBeUndefined();
    expect(stepRemovalText({ label, stepsBelow: 1 })?.question).toBe(
      "Remove fn-orders · invoke and the 1 call under it?",
    );
    expect(stepRemovalText({ label, stepsBelow: 2 })?.question).toBe(
      "Remove fn-orders · invoke and the 2 calls under it?",
    );
  });
});
