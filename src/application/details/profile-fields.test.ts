import { describe, expect, it } from "vitest";
import {
  checkRateDraft,
  checkTimeDraft,
  RATE_FIELD,
  TIME_FIELD,
} from "./workload-fields";

describe("a profile point's fields", () => {
  // Fails if a descriptor's label, unit, or help drifts from the design.
  it("have the design's labels, units, and help", () => {
    expect([TIME_FIELD.label, TIME_FIELD.unit]).toEqual(["Time", "s"]);
    expect([RATE_FIELD.label, RATE_FIELD.unit]).toEqual(["Rate", "requests/s"]);
    expect(TIME_FIELD.help).toBe(
      "When this point applies, in seconds from the start of the run.",
    );
  });

  // Fails if a negative time or rate says any other words, or 0 is refused.
  it("refuse a negative number in the design's words, and take 0", () => {
    expect(checkTimeDraft({ text: "-1", otherTimesSec: [] })).toEqual({
      status: "fails",
      message: "Time can't be negative.",
    });
    expect(checkRateDraft("-5")).toEqual({
      status: "fails",
      message: "Rate can't be negative.",
    });
    expect(checkRateDraft("0")).toEqual({ status: "passes", value: 0 });
    expect(checkTimeDraft({ text: "0", otherTimesSec: [] }).status).toBe(
      "passes",
    );
  });

  // Fails if a draft that isn't a number passes or says the negative words.
  it("refuse what isn't a number", () => {
    const check = checkRateDraft("lots");

    expect(check).toEqual({
      status: "fails",
      message: "Rate must be a number.",
    });
  });

  // Fails if another point's time is accepted, or its message names a time
  // other than the one typed.
  it("refuse a time another point has, naming it", () => {
    expect(checkTimeDraft({ text: "40", otherTimesSec: [0, 40] })).toEqual({
      status: "fails",
      message: "Another point is already at 40 s.",
    });
    expect(checkTimeDraft({ text: "41", otherTimesSec: [0, 40] })).toEqual({
      status: "passes",
      value: 41,
    });
  });
});
