import { describe, expect, it } from "vitest";
import { checkPhrases } from "../../../testing/check-phrases";
import { WAITING_HOLDS_LIMIT_PHRASES } from "./waiting-holds-limit-phrases";

/** table's workers, holding its slots. */
const pair = {
  componentId: "table",
  waitingLimit: "workers",
  heldLimit: "slots",
};

/** table's workers, as the busy statements name them. */
const busy = { componentId: "table", limitName: "workers", limit: 2 };

describe("waiting-holds-limit's phrases", () => {
  // Fails if a phrase's long or short form is worded other than its case
  // says, a long form loses its closing period or a short form gains one,
  // or a kind the table registers has no case here.
  it("words every case at both lengths", () => {
    expect(
      checkPhrases({
        phrases: WAITING_HOLDS_LIMIT_PHRASES,
        cases: [
          {
            name: "requests that waited",
            statement: { kind: "waiting-holds-limit", ...pair },
            long: "Requests waited for table's workers, holding its slots while they waited.",
            short: "requests waited for table's workers, holding its slots",
          },
          {
            name: "the workers busy, held limit never out",
            statement: {
              kind: "waiting-limit-busy",
              ...busy,
              seconds: 2,
              window: { fromMs: 1_000, toMs: 3_000 },
            },
            long: "All 2 of its workers were busy in 2 seconds from 1000ms to 3000ms, so requests arriving then waited for one.",
            short: "all 2 of table's workers were busy in 2 seconds",
          },
          {
            name: "the run of busy workers that led in, and one other second",
            statement: {
              kind: "waiting-limit-busy-run",
              ...busy,
              window: { fromMs: 2_000, toMs: 5_000 },
              otherSeconds: 1,
            },
            long: "All 2 of its workers were busy in every second from 2000ms to 5000ms, so requests arriving then waited for one. They were also all busy in 1 other second.",
            short: "all 2 of table's workers were busy from 2000ms to 5000ms",
          },
          {
            name: "the run of busy workers that led in, and no other",
            statement: {
              kind: "waiting-limit-busy-run",
              ...busy,
              window: { fromMs: 2_000, toMs: 5_000 },
              otherSeconds: 0,
            },
            long: "All 2 of its workers were busy in every second from 2000ms to 5000ms, so requests arriving then waited for one.",
            short: "all 2 of table's workers were busy from 2000ms to 5000ms",
          },
          {
            name: "what waiting holds",
            statement: {
              kind: "waiting-holds",
              componentId: "table",
              heldLimit: "slots",
              held: { kind: "concurrency", limit: 4 },
              running: 2,
              waitingPeak: 2,
              heldPeak: 4,
            },
            long: "Each waiting request holds one of its slots: 2 running and up to 2 waiting is 4, and its slots peaked at 4 of 4.",
            short: "each waiting request holds one of table's slots",
          },
          {
            name: "a held limit that never ran out",
            statement: { kind: "held-never-ran-out", ...pair },
            long: "Its slots never ran out while its workers were all busy.",
            short:
              "table's slots never ran out while its workers were all busy",
          },
          {
            name: "a held limit that ran out after the waiting began",
            statement: {
              kind: "held-ran-out",
              ...pair,
              seconds: 2,
              window: { fromMs: 3_000, toMs: 5_000 },
              waitingFromMs: 2_000,
            },
            long: "Its slots ran out while its workers were all busy in 2 seconds from 3000ms to 5000ms, 1000 after the waiting began at 2000ms.",
            short: "table's slots ran out while its workers were all busy",
          },
          {
            name: "a held limit that ran out as the waiting began",
            statement: {
              kind: "held-ran-out",
              ...pair,
              seconds: 1,
              window: { fromMs: 3_000, toMs: 4_000 },
              waitingFromMs: undefined,
            },
            long: "Its slots ran out while its workers were all busy in 1 second from 3000ms to 4000ms.",
            short: "table's slots ran out while its workers were all busy",
          },
          {
            name: "the flow with both out",
            statement: {
              kind: "waiting-flow",
              ...pair,
              completedPerSec: 2,
              arrivalsPerSec: 5,
            },
            long: "While its workers were all busy and its slots were out, table finished 2 requests a second on average, against 5 arriving.",
            short: "table finished 2 requests a second, against 5 arriving",
          },
          {
            name: "the flow with only the workers out",
            statement: {
              kind: "waiting-flow",
              ...pair,
              heldLimit: undefined,
              completedPerSec: 2,
              arrivalsPerSec: 3,
            },
            long: "While its workers were all busy, table finished 2 requests a second on average, against 3 arriving.",
            short: "table finished 2 requests a second, against 3 arriving",
          },
        ],
      }),
    ).toEqual([]);
  });
});
