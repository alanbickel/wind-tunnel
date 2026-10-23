import { describe, expect, it } from "vitest";
import { checkPhrases } from "../../../testing/check-phrases";
import { LATE_ASYNC_WORK_PHRASES } from "./late-async-work-phrases";

const wait = { from: "api", to: "fn", timeoutMs: 29_000 };

describe("late-async-work's phrases", () => {
  // Fails if a phrase's long or short form is worded other than its case
  // says, a long form loses its closing period or a short form gains one,
  // or a kind the table registers has no case here.
  it("words every case at both lengths", () => {
    expect(
      checkPhrases({
        phrases: LATE_ASYNC_WORK_PHRASES,
        cases: [
          {
            name: "work that finished late",
            statement: {
              kind: "late-async-work",
              queueId: "table",
              slowestMs: 41_000,
              wait,
            },
            long: "Work queued in table finished up to 41000 after its request, past the 29000 that api waits for fn.",
            short:
              "work queued in table finished past the 29000 api waits for fn",
          },
          {
            name: "the late seconds",
            statement: {
              kind: "late-seconds",
              over: 2,
              window: { fromMs: 0, toMs: 2_000 },
              timeoutMs: 29_000,
              highestP99Ms: 40_000,
            },
            long: "In 2 seconds from 0ms to 2000ms, the p99 of the deliveries that ended in the second was over 29000, and as high as 40000.",
            short: "the p99 of deliveries was over 29000 in 2 seconds",
          },
          {
            name: "seconds within the histogram's error",
            statement: {
              kind: "late-near-timeout",
              near: 1,
              timeoutMs: 29_000,
              percentileError: 0.05,
            },
            long: "In 1 of those seconds, the p99 was within the histogram's 0.05 error of 29000, so it may have been under it.",
            short: "in 1 of those seconds, the p99 may have been under 29000",
          },
          {
            name: "the answers, one workflow not in the project",
            statement: {
              kind: "answered-quickly",
              answered: [
                { workflowId: "read", p99Ms: 50 },
                { workflowId: "gone", p99Ms: 60 },
              ],
            },
            long: "Meanwhile, users were answered quickly, because a request ends once its work is queued: Read item within 50 and gone within 60 (the highest p99 of those seconds).",
            short:
              "users were answered quickly, because a request ends once its work is queued",
          },
          {
            name: "the wait no synchronous design could offer",
            statement: { kind: "no-synchronous-wait", wait },
            long: "No synchronous design could have offered that wait: api stops waiting for fn after 29000.",
            short: "api stops waiting for fn after 29000",
          },
        ],
      }),
    ).toEqual([]);
  });
});
