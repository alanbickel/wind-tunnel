import { describe, expect, it } from "vitest";
import { checkPhrases } from "../../../testing/check-phrases";
import { RECOVERY_PHRASES } from "./recovery-phrases";

describe("recovery's phrases", () => {
  // Fails if a phrase's long or short form is worded other than its case
  // says, a long form loses its closing period or a short form gains one,
  // or a kind the table registers has no case here.
  it("words every case at both lengths", () => {
    expect(
      checkPhrases({
        phrases: RECOVERY_PHRASES,
        cases: [
          {
            name: "failures that stopped",
            statement: {
              kind: "failures-stopped",
              lastFailedMs: 3_000,
              quietMs: 2_000,
            },
            long: "The last failure was in the second ending at 3000ms, and none followed in the 2000 after it.",
            short:
              "the last failure was at 3000ms, with none in the 2000 after it",
          },
          {
            name: "a bucket's peak after the failures",
            statement: {
              kind: "limit-peaked-after",
              componentId: "table",
              limitName: "readUnits",
              limit: { kind: "rate", limit: 100 },
              peak: 10,
            },
            long: "After it, table's readUnits peaked at 10 of 100 tokens drawn.",
            short:
              "after the last failure, table's readUnits peaked at 10 of 100 tokens drawn",
          },
          {
            name: "failures still going in a finished run",
            statement: { kind: "requests-still-failing", finished: true },
            long: "Requests were still failing with it when the run ended.",
            short: "requests were still failing with it when the run ended",
          },
          {
            name: "failures still going so far",
            statement: { kind: "requests-still-failing", finished: false },
            long: "Requests are still failing with it.",
            short: "requests are still failing with it",
          },
        ],
      }),
    ).toEqual([]);
  });
});
