import { describe, expect, it } from "vitest";
import type { LimitUse } from "../../domain/metrics/metrics-snapshot";
import { sampleRecord } from "../testing/sample-record";
import { sampleSnapshot } from "../testing/sample-snapshots";
import { limitPeaks } from "./limit-peaks";

const { project } = sampleRecord;

const concurrency = (peak: number): LimitUse => ({
  kind: "concurrency",
  name: "concurrency",
  limit: 10,
  current: 0,
  peak,
});

const requestRate = (peak: number): LimitUse => ({
  kind: "rate",
  name: "requestRate",
  limit: 100,
  burst: 50,
  current: peak,
  peak,
});

// fn peaks at 4 of 10 in second 1, then 2; api takes 80 per second, then
// 120 with burst tokens.
const snapshots = [
  sampleSnapshot({
    second: 1,
    api: { limits: [requestRate(80)] },
    fn: { limits: [concurrency(4)] },
  }),
  sampleSnapshot({
    second: 2,
    api: { limits: [requestRate(120)] },
    fn: { limits: [concurrency(2)] },
  }),
];

describe("limitPeaks", () => {
  // Fails if the peak is the latest second's rather than the highest, or if
  // the rows leave architecture order.
  it("gives each limit its highest peak so far, in architecture order", () => {
    expect(limitPeaks({ project, snapshots })).toEqual([
      {
        id: "api requestRate",
        componentId: "api",
        componentLabel: "API",
        name: "requestRate",
        kind: "rate",
        limit: 100,
        peak: 120,
        peakShare: 1.2,
      },
      {
        id: "fn concurrency",
        componentId: "fn",
        componentLabel: "Function",
        name: "concurrency",
        kind: "concurrency",
        limit: 10,
        peak: 4,
        peakShare: 0.4,
      },
    ]);
  });

  // Fails if a limit of 0 divides by zero instead of leaving the share out.
  it("leaves out the share of a limit of 0", () => {
    const zero = { ...concurrency(0), limit: 0 };
    const [row] = limitPeaks({
      project,
      snapshots: [sampleSnapshot({ second: 1, fn: { limits: [zero] } })],
    });
    expect(row).toMatchObject({ peak: 0, peakShare: undefined });
  });

  // Fails if it reads limits from a snapshot that isn't there.
  it("is empty before the first snapshot", () => {
    expect(limitPeaks({ project, snapshots: [] })).toEqual([]);
  });
});
