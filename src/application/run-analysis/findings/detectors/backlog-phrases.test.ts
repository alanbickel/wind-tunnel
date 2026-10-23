import { describe, expect, it } from "vitest";
import { checkPhrases } from "../../../testing/check-phrases";
import { BACKLOG_PHRASES } from "./backlog-phrases";

/** table's consumers, as the statements name them. */
const consumers = { componentId: "table", limitName: "consumers" };

/** A backlog from 3 s to 6 s. */
const backlog = {
  kind: "backlog",
  ...consumers,
  window: { fromMs: 3_000, toMs: 6_000 },
} as const;

/** How 25 accepted messages add up, 3 of them still waiting. */
const atEnd = {
  kind: "backlog-at-end",
  componentId: "table",
  waiting: 3,
  accepted: 25,
  delivered: 18,
  beingDelivered: 4,
} as const;

describe("backlog's phrases", () => {
  // Fails if a phrase's long or short form is worded other than its case
  // says, a long form loses its closing period or a short form gains one,
  // or a kind the table registers has no case here.
  it("words every case at both lengths", () => {
    expect(
      checkPhrases({
        phrases: BACKLOG_PHRASES,
        cases: [
          {
            name: "a backlog that emptied",
            statement: { ...backlog, state: "emptied", waiting: 0 },
            long: "Messages waited for table's consumers from 3000ms, and its backlog was empty by 6000ms.",
            short:
              "messages waited for table's consumers from 3000ms to 6000ms",
          },
          {
            name: "messages waiting when the run ended",
            statement: { ...backlog, state: "waiting", waiting: 3 },
            long: "Messages waited for table's consumers from 3000ms, and 3 were still waiting when the run ended.",
            short: "3 messages were still waiting in table when the run ended",
          },
          {
            name: "a message waiting so far",
            statement: { ...backlog, state: "waiting-so-far", waiting: 1 },
            long: "Messages waited for table's consumers from 3000ms, and 1 is still waiting so far.",
            short: "1 message is still waiting in table so far",
          },
          {
            name: "consumers busy, none leading in",
            statement: {
              kind: "consumers-busy",
              ...consumers,
              limit: 4,
              seconds: 1,
            },
            long: "All 4 of its consumers were busy in 1 second.",
            short: "all 4 of table's consumers were busy in 1 second",
          },
          {
            name: "the run of busy consumers that led in",
            statement: {
              kind: "consumers-busy-run",
              ...consumers,
              limit: 4,
              window: { fromMs: 2_000, toMs: 6_000 },
              otherSeconds: 1,
            },
            long: "All 4 of its consumers were busy in every second from 2000ms to 6000ms, so messages arriving then waited for one. They were also all busy in 1 other second.",
            short: "all 4 of table's consumers were busy from 2000ms to 6000ms",
          },
          {
            name: "a peak that grew",
            statement: {
              kind: "backlog-peak",
              peak: 9,
              peakEndMs: 5_000,
              fromMs: 3_000,
              arrivalsPerSec: 11,
              deliveredPerSec: 5,
              growthPerSec: 6,
            },
            long: "It peaked at 9 messages in the second ending at 5000ms. From 3000ms to then, messages arrived at 11 a second and were delivered at 5, so it grew by about 6 a second.",
            short: "the backlog peaked at 9 messages at 5000ms",
          },
          {
            name: "a peak that didn't grow",
            statement: {
              kind: "backlog-peak",
              peak: 1,
              peakEndMs: 4_000,
              fromMs: 3_000,
              arrivalsPerSec: 5,
              deliveredPerSec: 5,
              growthPerSec: 0,
            },
            long: "It peaked at 1 message in the second ending at 4000ms. From 3000ms to then, messages arrived at 5 a second and were delivered at 5.",
            short: "the backlog peaked at 1 message at 4000ms",
          },
          {
            name: "how late deliveries landed",
            statement: {
              kind: "backlog-latency",
              slowestMs: 3_200,
              highestP99Ms: 3_100,
            },
            long: "Deliveries in those seconds landed up to 3200 after their requests; the highest p99 of a second was 3100.",
            short: "deliveries landed up to 3200 after their requests",
          },
          {
            name: "the accepted messages when the run ended",
            statement: { ...atEnd, finished: true },
            long: "When the run ended, 3 messages were still waiting: of the 25 accepted, 18 had been delivered and 4 were being delivered.",
            short:
              "3 of the 25 messages table accepted were still waiting when the run ended",
          },
          {
            name: "the accepted messages so far",
            statement: { ...atEnd, finished: false },
            long: "So far, 3 messages are waiting: of the 25 accepted, 18 have been delivered and 4 are being delivered.",
            short: "3 of the 25 messages table accepted are waiting so far",
          },
        ],
      }),
    ).toEqual([]);
  });
});
