import { describe, expect, it } from "vitest";
import { checkPhrases } from "../../testing/check-phrases";
import type { LimitPeak } from "../limit-peaks";
import type { WorkflowTotals } from "../run-totals";
import type { RefusingLimits } from "./no-headroom";
import { VERDICT_PHRASES } from "./verdict-phrases";

/** Requests over every workflow, with the counts given. */
function requests(
  counts: Pick<WorkflowTotals, "succeeded" | "failed" | "inProgress">,
): WorkflowTotals {
  const started = counts.succeeded + counts.failed + counts.inProgress;
  return { id: "all", label: "All workflows", started, ...counts };
}

/** A limit of 10 of fn's at `peak`, which refuses when full. */
function peakOf(peak: number): LimitPeak {
  return {
    id: "fn concurrency",
    componentId: "fn",
    componentLabel: "Function",
    name: "concurrency",
    kind: "concurrency",
    whenFull: { kind: "refuse", reason: "throttled" },
    limit: 10,
    peak,
    peakShare: peak / 10,
    exhausted: peak === 10,
    flow: undefined,
  };
}

/** api's bucket of 100 tokens, 90 of them drawn at its peak. */
const requestRate: LimitPeak = {
  ...peakOf(90),
  id: "api requestRate",
  componentId: "api",
  componentLabel: "API",
  name: "requestRate",
  kind: "rate",
  limit: 100,
  peakShare: 0.9,
  flow: { ratePerSec: 50, busiestTakenPerSec: 70 },
};

/** A component's refusing limits that ran out, in 2 seconds from 0 s. */
function refusing(
  limits: Pick<RefusingLimits, "componentId" | "limitNames">,
): RefusingLimits {
  return {
    ...limits,
    secondsOut: 2,
    window: { fromMs: 0, toMs: 2_000 },
    rejected: 3,
  };
}

const summary = { kind: "verdict-summary", warnings: 0 } as const;

describe("the verdict's phrases", () => {
  // Fails if a phrase's long or short form is worded other than its case
  // says, a long form loses its closing period or a short form gains one,
  // or a kind the table registers has no case here.
  it("words every case at both lengths", () => {
    expect(
      checkPhrases({
        phrases: VERDICT_PHRASES,
        cases: [
          {
            name: "a healthy run's counts, finished",
            statement: {
              ...summary,
              level: "healthy",
              finished: true,
              requests: requests({ succeeded: 9, failed: 0, inProgress: 1 }),
            },
            long: "All 9 answered requests succeeded; 1 was still in progress when the run ended.",
            short: "all 9 answered requests succeeded",
          },
          {
            name: "a healthy run's counts, so far",
            statement: {
              ...summary,
              level: "healthy",
              finished: false,
              requests: requests({ succeeded: 7, failed: 0, inProgress: 3 }),
            },
            long: "All 7 answered requests succeeded; 3 are in progress.",
            short: "all 7 answered requests succeeded",
          },
          {
            name: "a degraded run's counts",
            statement: {
              ...summary,
              level: "degraded",
              finished: true,
              requests: requests({ succeeded: 9, failed: 0, inProgress: 1 }),
              warnings: 1,
            },
            long: "All 9 answered requests succeeded, but 1 finding is a warning; 1 was still in progress when the run ended.",
            short: "all 9 answered requests succeeded",
          },
          {
            name: "a failing run's counts",
            statement: {
              ...summary,
              level: "failing",
              finished: true,
              requests: requests({ succeeded: 3, failed: 1, inProgress: 0 }),
            },
            long: "1 of 4 answered requests failed (0.25).",
            short: "1 of 4 answered requests failed",
          },
          {
            name: "no request answered yet",
            statement: {
              ...summary,
              level: "healthy",
              finished: false,
              requests: requests({ succeeded: 0, failed: 0, inProgress: 3 }),
            },
            long: "No request has been answered yet; 3 are in progress.",
            short: "no request has been answered",
          },
          {
            name: "no request answered in a finished run",
            statement: {
              ...summary,
              level: "healthy",
              finished: true,
              requests: requests({ succeeded: 0, failed: 0, inProgress: 0 }),
            },
            long: "No request was answered.",
            short: "no request has been answered",
          },
          {
            name: "one component's limit that ran out and refused",
            statement: {
              kind: "no-headroom",
              refusing: [
                refusing({ componentId: "fn", limitNames: ["concurrency"] }),
              ],
            },
            long: "No headroom: fn concurrency ran out in 2 seconds from 0ms to 2000ms, and fn refused 3 attempts; no request failed with its rejections.",
            short: "fn concurrency ran out and refused 3 attempts",
          },
          {
            name: "two components' limits that ran out and refused",
            statement: {
              kind: "no-headroom",
              refusing: [
                refusing({ componentId: "fn", limitNames: ["concurrency"] }),
                refusing({
                  componentId: "table",
                  limitNames: ["readUnits", "writeUnits"],
                }),
              ],
            },
            long: "No headroom: fn concurrency ran out in 2 seconds from 0ms to 2000ms, and fn refused 3 attempts; table readUnits and writeUnits ran out in 2 seconds from 0ms to 2000ms, and table refused 3 attempts; no request failed with their rejections.",
            short:
              "fn concurrency ran out and refused 3 attempts; table readUnits and writeUnits ran out and refused 3 attempts",
          },
          {
            name: "the limit closest to failing",
            statement: {
              kind: "closest-to-failing",
              headroom: { limit: peakOf(4), warmUp: undefined },
            },
            long: "Closest to failing: fn concurrency, at most 4 of 10 (0.4).",
            short: "fn concurrency peaked at 4 of 10 (0.4)",
          },
          {
            name: "a peak that came only during cold starts",
            statement: {
              kind: "closest-to-failing",
              headroom: {
                limit: peakOf(6),
                warmUp: {
                  window: { fromMs: 0, toMs: 1_000 },
                  coldStarts: new Map([["fn", 6]]),
                  warmPeak: 3,
                },
              },
            },
            long: "Closest to failing: fn concurrency, at most 6 of 10 (0.6) from 0ms to 1000ms, while fn had 6 cold starts; at most 3 of 10 (0.3) in the seconds without cold starts.",
            short: "fn concurrency peaked at 6 of 10 (0.6)",
          },
          {
            name: "a peak during cold starts, with no second without",
            statement: {
              kind: "closest-to-failing",
              headroom: {
                limit: peakOf(6),
                warmUp: {
                  window: { fromMs: 0, toMs: 1_000 },
                  coldStarts: new Map([["fn", 6]]),
                  warmPeak: undefined,
                },
              },
            },
            long: "Closest to failing: fn concurrency, at most 6 of 10 (0.6) from 0ms to 1000ms, while fn had 6 cold starts.",
            short: "fn concurrency peaked at 6 of 10 (0.6)",
          },
          {
            name: "a bucket closest to failing",
            statement: {
              kind: "closest-to-failing",
              headroom: { limit: requestRate, warmUp: undefined },
            },
            long: "Closest to failing: api requestRate, at most 90 of 100 tokens drawn (0.9); its busiest second took 70 tokens, against a refill of 50 a second.",
            short: "api requestRate peaked at 90 of 100 tokens drawn (0.9)",
          },
        ],
      }),
    ).toEqual([]);
  });
});
