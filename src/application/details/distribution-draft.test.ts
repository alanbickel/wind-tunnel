import { describe, expect, it } from "vitest";
import {
  checkDistributionDraft,
  distributionDraft,
  shownDraft,
  switchKind,
  type DistributionDraft,
} from "./distribution-draft";

const QUERY_TIME = distributionDraft({
  kind: "lognormal",
  medianMs: 15,
  p99Ms: 60,
});

/** The draft with one part's text changed. */
function typed(
  draft: DistributionDraft,
  key: string,
  text: string,
): DistributionDraft {
  return { ...draft, texts: { ...draft.texts, [key]: text } };
}

describe("a distribution's draft", () => {
  // Fails if a distribution's parts don't each get their own text.
  it("shows each part of the stored value", () => {
    expect(QUERY_TIME).toEqual({
      kind: "lognormal",
      texts: { medianMs: "15", p99Ms: "60" },
    });
  });

  // Fails if the p99 rule is worded with the schema's keys ("p99Ms must
  // be at least medianMs"), or sits on the median, not the p99.
  it("words the p99's rule on the p99, with the median's value", () => {
    expect(checkDistributionDraft(typed(QUERY_TIME, "p99Ms", "10"))).toEqual({
      status: "fails",
      messages: { p99Ms: "The p99 must be at least the median (15 ms)." },
    });
  });

  // Fails if a part's range goes unchecked, or its message misses it.
  it("words a part out of range on that part", () => {
    expect(checkDistributionDraft(typed(QUERY_TIME, "medianMs", "0"))).toEqual({
      status: "fails",
      messages: { medianMs: "The median must be more than 0." },
    });
  });

  // Fails if a passing draft isn't turned into the distribution it shows.
  it("passes as the distribution it shows", () => {
    expect(checkDistributionDraft(typed(QUERY_TIME, "p99Ms", "90"))).toEqual({
      status: "passes",
      value: { kind: "lognormal", medianMs: 15, p99Ms: 90 },
    });
  });

  // Fails if switching kind leaves a part empty, or a constant doesn't
  // take the lognormal's median.
  it("fills a new kind's parts from the old one's typical value", () => {
    const constant = switchKind(QUERY_TIME, "constant");
    expect(constant.texts["valueMs"]).toBe("15");
    expect(checkDistributionDraft(constant)).toEqual({
      status: "passes",
      value: { kind: "constant", valueMs: 15 },
    });
    const stored = distributionDraft({ kind: "constant", valueMs: 15 });
    expect(switchKind(stored, "lognormal")).toEqual({
      kind: "lognormal",
      texts: { valueMs: "15", medianMs: "15", p99Ms: "15" },
    });
    expect(switchKind(stored, "exponential").texts["meanMs"]).toBe("15");
  });

  // Fails if a switch drops the parts of the kind it leaves, so trying
  // another kind and switching back loses the p99 (it comes back as the
  // median, 15). Broken by returning only the new kind's texts.
  it("puts a kind's values back when switched back to it", () => {
    const back = switchKind(
      switchKind(switchKind(QUERY_TIME, "exponential"), "constant"),
      "lognormal",
    );
    expect(checkDistributionDraft(back)).toEqual({
      status: "passes",
      value: { kind: "lognormal", medianMs: 15, p99Ms: 60 },
    });
  });

  // Fails if the texts kept from kinds switched away from are shown, so a
  // round trip of kinds looks changed though nothing on screen is.
  // Broken by returning the draft as it is.
  it("shows only the kind's parts after a round trip of kinds", () => {
    const back = switchKind(
      switchKind(switchKind(QUERY_TIME, "exponential"), "constant"),
      "lognormal",
    );
    expect(shownDraft(back)).toEqual(QUERY_TIME);
  });
});
