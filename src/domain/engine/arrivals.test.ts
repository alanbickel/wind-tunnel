import { describe, expect, it } from "vitest";
import type { Workload } from "../model/project";
import { SeededRandom } from "../random/random-source";
import type { ArrivalProcess } from "./arrival-process";
import { rateAt } from "./arrivals";
import { PoissonArrivalProcess } from "./poisson-arrival-process";

const workload = (overrides: Partial<Workload> = {}): Workload => ({
  id: "w",
  name: "Workload",
  durationMs: 60_000,
  seed: 1,
  mix: [{ workflowId: "only", weight: 1 }],
  profile: [{ atMs: 0, requestsPerSec: 100 }],
  ...overrides,
});

/** All arrival times, in ms. */
const arrivals = (process: ArrivalProcess): number[] => {
  const times: number[] = [];
  for (let t = process.next(0); t !== undefined; t = process.next(t)) {
    times.push(t);
  }
  return times;
};

const process = (w: Workload, seed = 1) =>
  new PoissonArrivalProcess({
    workload: w,
    timing: new SeededRandom(seed),
    choice: new SeededRandom(seed + 1),
  });

describe("rateAt", () => {
  const profile = [
    { atMs: 10_000, requestsPerSec: 200 },
    { atMs: 20_000, requestsPerSec: 2_000 },
    { atMs: 40_000, requestsPerSec: 2_000 },
  ];

  it("interpolates linearly between points", () => {
    expect(rateAt(profile, 15_000)).toBe(1_100);
    expect(rateAt(profile, 30_000)).toBe(2_000);
  });

  it("is flat before the first point and after the last", () => {
    expect(rateAt(profile, 0)).toBe(200);
    expect(rateAt(profile, 50_000)).toBe(2_000);
  });
});

describe("PoissonArrivalProcess", () => {
  it("produces about rate × duration arrivals, in order, within the duration", () => {
    const times = arrivals(process(workload()));
    // 6,000 expected; a Poisson count's standard deviation is about 77.
    expect(times.length).toBeGreaterThan(5_700);
    expect(times.length).toBeLessThan(6_300);
    expect(times.every((t, i) => i === 0 || t >= (times[i - 1] ?? 0))).toBe(
      true,
    );
    expect(times.at(-1)).toBeLessThan(60_000);
  });

  it("follows the profile's ramp", () => {
    const times = arrivals(
      process(
        workload({
          durationMs: 20_000,
          profile: [
            { atMs: 0, requestsPerSec: 100 },
            { atMs: 10_000, requestsPerSec: 100 },
            { atMs: 20_000, requestsPerSec: 1_100 },
          ],
        }),
      ),
    );
    const firstHalf = times.filter((t) => t < 10_000).length;
    const secondHalf = times.length - firstHalf;
    // Expected: 1,000 in the first 10 s, 6,000 in the ramp.
    expect(firstHalf).toBeGreaterThan(850);
    expect(firstHalf).toBeLessThan(1_150);
    expect(secondHalf).toBeGreaterThan(5_700);
    expect(secondHalf).toBeLessThan(6_300);
  });

  it("produces nothing when the rate is zero", () => {
    const w = workload({ profile: [{ atMs: 0, requestsPerSec: 0 }] });
    expect(process(w).next(0)).toBeUndefined();
  });

  it("is reproducible from its seeds", () => {
    expect(arrivals(process(workload(), 7))).toEqual(
      arrivals(process(workload(), 7)),
    );
  });

  it("picks workflows by weight", () => {
    const p = process(
      workload({
        mix: [
          { workflowId: "get", weight: 4 },
          { workflowId: "create", weight: 1 },
        ],
      }),
    );
    const picks = Array.from({ length: 10_000 }, () => p.pickWorkflow());
    const gets = picks.filter((id) => id === "get").length;
    expect(gets).toBeGreaterThan(7_800);
    expect(gets).toBeLessThan(8_200);
  });
});
