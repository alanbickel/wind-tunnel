import { describe, expect, it, vi } from "vitest";

vi.mock("../status-words", () => ({
  STATUS_WORDS: { refused: "turned away", waited: "held", ok: "fine" },
}));

import { sampleWording } from "../../testing/sample-findings";
import type { RefusingLimits } from "./no-headroom";
import {
  RETRIES_ABSORBED_PHRASES,
  type RetriedRefusalsStatement,
} from "./detectors/retries-absorbed-phrases";
import { VERDICT_PHRASES, type VerdictStatement } from "./verdict-phrases";

const refusing: RefusingLimits = {
  componentId: "fn",
  limitNames: ["concurrency"],
  secondsOut: 2,
  window: { fromMs: 0, toMs: 2000 },
  rejected: 3,
};

describe("the findings' wording and the badge's status words", () => {
  // Fails if verdict-phrases words "refused" itself instead of building it
  // from STATUS_WORDS, so a change to the vocabulary misses the findings.
  it("builds the verdict's 'refused' from the status vocabulary", () => {
    const word = sampleWording(VERDICT_PHRASES);
    const statement: VerdictStatement = {
      kind: "no-headroom",
      refusing: [refusing],
    };
    expect(word(statement, "short")).toContain("turned away 3 attempts");
  });

  // Fails if retries-absorbed-phrases words "refused" itself instead of
  // building it from STATUS_WORDS.
  it("builds retries-absorbed's 'refused' from the status vocabulary", () => {
    const word = sampleWording(RETRIES_ABSORBED_PHRASES);
    const statement: RetriedRefusalsStatement = {
      kind: "retries-absorbed",
      componentId: "fn",
      rejected: 17,
      failedRequests: 0,
      failedDeliveries: 0,
    };
    expect(word(statement, "short")).toContain("turned away 17 attempts");
  });
});
