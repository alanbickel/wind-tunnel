import { describe, expect, it } from "vitest";
import { checkPhrases } from "../../../testing/check-phrases";
import { LIMIT_REFUSED_PHRASES } from "./limit-refused-phrases";

describe("limit-refused's phrases", () => {
  // Fails if a phrase's long or short form is worded other than its case
  // says, a long form loses its closing period or a short form gains one,
  // or a kind the table registers has no case here.
  it("words every case at both lengths", () => {
    expect(
      checkPhrases({
        phrases: LIMIT_REFUSED_PHRASES,
        cases: [
          {
            name: "a reason no limit declares",
            statement: {
              kind: "no-limit-refuses",
              componentId: "table",
              reason: "throttled",
            },
            long: "No limit of table refuses with throttled, so the run can't say what ran out.",
            short: "no limit of table refuses with throttled",
          },
          {
            name: "declared limits that never ran out",
            statement: {
              kind: "no-refusing-limit-ran-out",
              componentId: "table",
              reason: "throttled",
              limitNames: ["readUnits", "writeUnits"],
            },
            long: "table's readUnits and writeUnits refuse with throttled, but none ran out in a second with these failures.",
            short:
              "table's readUnits and writeUnits never ran out while it refused with throttled",
          },
          {
            name: "a declared limit that never ran out",
            statement: {
              kind: "no-refusing-limit-ran-out",
              componentId: "fn",
              reason: "throttled",
              limitNames: ["concurrency"],
            },
            long: "fn's concurrency refuses with throttled, but it never ran out in a second with these failures.",
            short:
              "fn's concurrency never ran out while it refused with throttled",
          },
          {
            name: "a concurrency limit out in every failing second",
            statement: {
              kind: "limit-held-all",
              componentId: "fn",
              limitName: "concurrency",
              limit: 10,
              coverage: { secondsOut: 2, secondsFailing: 2 },
            },
            long: "fn held all 10 of its concurrency in every second with these failures.",
            short: "fn held all 10 of its concurrency",
          },
          {
            name: "a bucket out in some failing seconds",
            statement: {
              kind: "bucket-ran-out",
              componentId: "table",
              limitName: "readUnits",
              limit: 100,
              coverage: { secondsOut: 1, secondsFailing: 3 },
            },
            long: "table's readUnits bucket, which holds 100 tokens, had less than one left in 1 of the 3 seconds with these failures.",
            short: "table's readUnits bucket ran out",
          },
          {
            name: "refused attempts that each failed a request",
            statement: {
              kind: "refused-attempts-failed",
              componentId: "table",
              rejected: 2,
              ended: "requests",
            },
            long: "table refused 2 attempts, and each one failed a request.",
            short: "every attempt table refused failed a request",
          },
          {
            name: "a refused attempt that failed a delivery",
            statement: {
              kind: "refused-attempts-failed",
              componentId: "table",
              rejected: 1,
              ended: "deliveries",
            },
            long: "table refused 1 attempt, and each one failed a delivery.",
            short: "every attempt table refused failed a delivery",
          },
          {
            name: "refused attempts that failed either",
            statement: {
              kind: "refused-attempts-failed",
              componentId: "table",
              rejected: 3,
              ended: "both",
            },
            long: "table refused 3 attempts, and each one failed a request or a delivery.",
            short: "every attempt table refused failed a request or a delivery",
          },
        ],
      }),
    ).toEqual([]);
  });
});
