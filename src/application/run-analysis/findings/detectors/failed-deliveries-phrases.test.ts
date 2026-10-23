import { describe, expect, it } from "vitest";
import { checkPhrases } from "../../../testing/check-phrases";
import { CAUSE_PHRASES } from "./cause-parts-phrases";
import { FAILED_DELIVERIES_PHRASES } from "./failed-deliveries-phrases";

describe("failed-deliveries' phrases", () => {
  // Fails if a phrase's long or short form is worded other than its case
  // says, a long form loses its closing period or a short form gains one,
  // or a kind the table registers has no case here.
  it("words every case at both lengths", () => {
    expect(
      checkPhrases({
        phrases: FAILED_DELIVERIES_PHRASES,
        shared: [CAUSE_PHRASES],
        cases: [
          {
            name: "deliveries a component refused",
            statement: {
              kind: "deliveries-refused",
              componentId: "table",
              reason: "throttled",
              failed: 3,
              queueIds: ["fn"],
              seconds: 2,
              window: { fromMs: 1_000, toMs: 3_000 },
            },
            long: "table refused 3 deliveries from fn with throttled in 2 seconds from 1000ms to 3000ms, and each went back to be tried again.",
            short: "table refused 3 deliveries from fn with throttled",
          },
          {
            name: "a delivery that timed out, from two queues",
            statement: {
              kind: "deliveries-timed-out",
              componentId: "table",
              failed: 1,
              queueIds: ["fn", "api"],
              seconds: 1,
              window: { fromMs: 0, toMs: 1_000 },
            },
            long: "1 delivery from fn and api failed because table didn't answer in time, in 1 second from 0ms to 1000ms, and it went back to be tried again.",
            short:
              "1 delivery from fn and api failed because table didn't answer in time",
          },
          {
            name: "the queue's attempts",
            statement: {
              kind: "queue-attempts",
              queueId: "fn",
              failed: 3,
              delivered: 47,
              failedAll: 3,
              beingDelivered: 2,
            },
            long: "That's 3 of fn's 52 delivery attempts (0.057692307692307696). Of those, 47 were delivered, 3 failed, and 2 were still being delivered.",
            short:
              "that's 3 of fn's 52 delivery attempts (0.057692307692307696)",
          },
          {
            name: "the backlog a failed delivery went back to",
            statement: {
              kind: "failed-delivery-waits",
              queueId: "fn",
              mostWaiting: 9,
            },
            long: "A failed delivery waits in the backlog again: fn had up to 9 messages waiting in a second with one of these failures.",
            short: "a failed delivery waits in fn's backlog again",
          },
          {
            name: "failures that stopped",
            statement: {
              kind: "deliveries-stopped-failing",
              lastFailedMs: 3_000,
              quietMs: 2_000,
            },
            long: "The last failed in the second ending at 3000ms, and none failed in the 2000 after it.",
            short: "the last failed at 3000ms, with none in the 2000 after it",
          },
          {
            name: "failures in a finished run's last second",
            statement: { kind: "deliveries-still-failing", finished: true },
            long: "Deliveries were still failing with it in the run's last second, so nothing in the run says those messages will land.",
            short:
              "deliveries were still failing with it in the run's last second",
          },
          {
            name: "failures in the last second so far",
            statement: { kind: "deliveries-still-failing", finished: false },
            long: "Deliveries are still failing with it.",
            short: "deliveries are still failing with it",
          },
          {
            name: "no messages waiting at the end",
            statement: {
              kind: "queue-waiting-at-end",
              queueId: "fn",
              waiting: 0,
            },
            long: "At the end of the last second, fn had no messages waiting.",
            short: "fn had no messages waiting at the end",
          },
          {
            name: "one message waiting at the end",
            statement: {
              kind: "queue-waiting-at-end",
              queueId: "fn",
              waiting: 1,
            },
            long: "At the end of the last second, fn had 1 message waiting.",
            short: "fn had 1 message waiting at the end",
          },
        ],
      }),
    ).toEqual([]);
  });
});
