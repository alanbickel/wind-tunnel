import { describe, expect, it } from "vitest";
import type { LimitUse } from "../../domain/metrics/metrics-snapshot";
import { sampleRecord } from "../testing/sample-record";
import { sampleSnapshot } from "../testing/sample-snapshots";
import { limitPeaks } from "./limit-peaks";

const { project } = sampleRecord;

const concurrency = (peak: number): LimitUse => ({
  kind: "concurrency",
  name: "concurrency",
  whenFull: { kind: "refuse", reason: "throttled" },
  limit: 10,
  current: 0,
  peak,
});

/** A bucket of 100 refilling at 50 per second. */
const requestRate = (
  peak: number,
  takenPerSec: number,
  refused = 0,
): LimitUse => ({
  kind: "rate",
  name: "requestRate",
  whenFull: { kind: "refuse", reason: "throttled" },
  limit: 100,
  current: 0,
  peak,
  ratePerSec: 50,
  takenPerSec,
  refused,
});

// Every peak comes first: fn holds 4 of 10, then 2. api's bucket is drawn
// down by 90 while taking 70 per second, then by 30 while taking 40.
const snapshots = [
  sampleSnapshot({
    second: 1,
    api: { limits: [requestRate(90, 70)] },
    fn: { limits: [concurrency(4)] },
  }),
  sampleSnapshot({
    second: 2,
    api: { limits: [requestRate(30, 40)] },
    fn: { limits: [concurrency(2)] },
  }),
];

describe("limitPeaks", () => {
  // Fails if the peak or the busiest flow is the latest second's rather than
  // the highest, if the rows leave architecture order, or if a row drops
  // what the limit does when it's full.
  it("gives each limit its highest peak so far, in architecture order", () => {
    expect(limitPeaks({ project, workloadId: "steady", snapshots })).toEqual([
      {
        id: "api requestRate",
        componentId: "api",
        componentLabel: "API",
        name: "requestRate",
        kind: "rate",
        whenFull: { kind: "refuse", reason: "throttled" },
        limit: 100,
        peak: 90,
        peakShare: 0.9,
        exhausted: false,
        flow: { ratePerSec: 50, busiestTakenPerSec: 70 },
      },
      {
        id: "fn concurrency",
        componentId: "fn",
        componentLabel: "Function",
        name: "concurrency",
        kind: "concurrency",
        whenFull: { kind: "refuse", reason: "throttled" },
        limit: 10,
        peak: 4,
        peakShare: 0.4,
        exhausted: false,
        flow: undefined,
      },
    ]);
  });

  // Fails if `exhausted` reads the bucket's level, or `peakShare` = 1,
  // rather than whether it refused a request in any second (#314): it
  // refused a large one with 60 tokens left, then was drawn to half a token
  // left without refusing any.
  it("marks a bucket exhausted if it refused a request in any second", () => {
    const peaksOf = (...uses: LimitUse[]) =>
      limitPeaks({
        project,
        workloadId: "steady",
        snapshots: uses.map((use, index) =>
          sampleSnapshot({ second: index + 1, api: { limits: [use] } }),
        ),
      })[0];
    const lowest = requestRate(99.5, 0);
    expect(peaksOf(lowest)).toMatchObject({ exhausted: false });
    expect(peaksOf(requestRate(40, 0, 1), lowest)).toMatchObject({
      peakShare: 0.995,
      exhausted: true,
    });
  });

  // Fails if a limit of 0 divides by zero instead of leaving the share out.
  it("leaves out the share of a limit of 0", () => {
    const zero = { ...concurrency(0), limit: 0 };
    const [row] = limitPeaks({
      project,
      workloadId: "steady",
      snapshots: [sampleSnapshot({ second: 1, fn: { limits: [zero] } })],
    });
    expect(row).toMatchObject({ peak: 0, peakShare: undefined });
  });

  // Fails if it reads limits from a snapshot that isn't there.
  it("is empty before the first snapshot", () => {
    expect(
      limitPeaks({ project, workloadId: "steady", snapshots: [] }),
    ).toEqual([]);
  });
});
