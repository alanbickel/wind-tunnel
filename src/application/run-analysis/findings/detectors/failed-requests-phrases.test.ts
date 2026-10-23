import { describe, expect, it } from "vitest";
import { checkPhrases } from "../../../testing/check-phrases";
import { CAUSE_PHRASES } from "./cause-parts-phrases";
import { FAILED_REQUESTS_PHRASES } from "./failed-requests-phrases";
import { RECOVERY_PHRASES } from "./recovery-phrases";

describe("failed-requests' phrases", () => {
  // Fails if a phrase's long or short form is worded other than its case
  // says, a long form loses its closing period or a short form gains one,
  // or a kind the table registers has no case here.
  it("words every case at both lengths", () => {
    expect(
      checkPhrases({
        phrases: FAILED_REQUESTS_PHRASES,
        shared: [CAUSE_PHRASES, RECOVERY_PHRASES],
        cases: [
          {
            name: "requests a component refused",
            statement: {
              kind: "requests-failed",
              componentId: "table",
              reason: "throttled",
              failed: 3,
              window: { fromMs: 1_000, toMs: 3_000 },
            },
            long: "3 requests failed with table: throttled, from 1000ms to 3000ms.",
            short: "3 requests failed with table: throttled",
          },
          {
            name: "a request that timed out",
            statement: {
              kind: "requests-timed-out",
              componentId: "fn",
              failed: 1,
              window: { fromMs: 0, toMs: 1_000 },
            },
            long: "1 request failed because fn didn't answer in time, from 0ms to 1000ms.",
            short: "1 request failed because fn didn't answer in time",
          },
          {
            name: "failures by workflow, one not in the project",
            statement: {
              kind: "failed-by-workflow",
              workflows: [
                { workflowId: "read", failed: 2 },
                { workflowId: "gone", failed: 1 },
              ],
              failed: 3,
              answered: 30,
            },
            long: "That's 2 Read item and 1 gone requests, 0.1 of the 30 answered.",
            short: "that's 0.1 of the 30 answered",
          },
          {
            name: "the worst second",
            statement: { kind: "worst-second", failed: 2, endMs: 2_000 },
            long: "The most in one second was 2, in the second ending at 2000ms.",
            short: "the most in one second was 2, ending at 2000ms",
          },
        ],
      }),
    ).toEqual([]);
  });
});
