import { describe, expect, it } from "vitest";
import { checkPhrases } from "../../../testing/check-phrases";
import { BUCKET_DRAINED_PHRASES } from "./bucket-drained-phrases";

describe("bucket-drained's phrases", () => {
  // Fails if a phrase's long or short form is worded other than its case
  // says, a long form loses its closing period or a short form gains one,
  // or a kind the table registers has no case here.
  it("words every case at both lengths", () => {
    expect(
      checkPhrases({
        phrases: BUCKET_DRAINED_PHRASES,
        cases: [
          {
            name: "a bucket that drained",
            statement: {
              kind: "bucket-drained",
              componentId: "table",
              limitName: "readUnits",
              drainFromMs: 1_000,
              firstOutEndMs: 4_000,
            },
            long: "table's readUnits bucket drained from 1000ms and ran out in the second ending at 4000ms.",
            short:
              "table's readUnits bucket drained from 1000ms and ran out by 4000ms",
          },
          {
            name: "a flow faster than the refill",
            statement: {
              kind: "drain-flow",
              fullAtMs: 1_000,
              takenPerSec: 8,
              ratePerSec: 5,
            },
            long: "It was last full at 1000ms. From then, requests took 8 tokens a second on average, against a refill of 5.",
            short:
              "requests took 8 tokens a second on average, against a refill of 5",
          },
          {
            name: "a flow no faster than the refill",
            statement: {
              kind: "drain-flow",
              fullAtMs: 1_000,
              takenPerSec: 15,
              ratePerSec: 20,
            },
            long: "It was last full at 1000ms. From then, requests took 15 tokens a second on average, no more than its refill of 20 a second, but faster than the refill within a second.",
            short:
              "requests took 15 tokens a second on average, against a refill of 20",
          },
          {
            name: "how long the burst lasted",
            statement: {
              kind: "burst-lasted",
              burst: 10,
              atLeastMs: 2_000,
              atMostMs: 3_000,
            },
            long: "Its burst of 10 tokens lasted between 2000 and 3000.",
            short: "its burst of 10 tokens lasted at most 3000",
          },
          {
            name: "how long a full bucket lasts",
            statement: { kind: "burst-predicted", predictedMs: 3_000 },
            long: "At that flow, a full bucket lasts about 3000: (burst − 1) ÷ (flow − refill).",
            short: "at that flow, a full bucket lasts about 3000",
          },
        ],
      }),
    ).toEqual([]);
  });
});
