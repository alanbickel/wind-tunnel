import { describe, expect, it } from "vitest";
import type { Workload } from "../model/project";
import { SeededRandom } from "../random/seeded-random";
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

// The design's "What the profile does past the duration" row.
describe("a profile point past the run's end", () => {
  const toward = [
    { atMs: 40_000, requestsPerSec: 2_000 },
    { atMs: 50_000, requestsPerSec: 200 },
  ];
  const cutAt45s = (profile: Workload["profile"]) =>
    workload({ durationMs: 45_000, profile });

  // Fails if the rate near the end is read from the point at 40 s (2,000)
  // or the point past the end (200) rather than the line between them.
  it("still sets the rate on the line toward it", () => {
    expect(rateAt(toward, 45_000)).toBe(1_100);
  });

  // Fails if the run doesn't follow the line until it stops: from 40 s to
  // 45 s the rate falls from 2,000 to 1,100, so about 7,750 arrive, not
  // the 10,000 a flat 2,000 would give, and none arrive after 45 s.
  it("makes arrivals follow the line until the run stops", () => {
    const times = arrivals(process(cutAt45s(toward)));
    const lastFiveSeconds = times.filter((t) => t >= 40_000);
    // A Poisson count of 7,750 has a standard deviation of about 88.
    expect(lastFiveSeconds.length).toBeGreaterThan(7_400);
    expect(lastFiveSeconds.length).toBeLessThan(8_100);
    expect(times.at(-1)).toBeLessThan(45_000);
  });

  // Fails if a point after the first one past the end changes an arrival
  // although it doesn't raise the highest rate: the engine draws
  // candidates at the profile's peak, so only a higher peak moves them.
  it("changes no arrival through later points that stay under the peak", () => {
    const more = [
      ...toward,
      { atMs: 60_000, requestsPerSec: 100 },
      { atMs: 70_000, requestsPerSec: 2_000 },
    ];

    expect(arrivals(process(cutAt45s(more)))).toEqual(
      arrivals(process(cutAt45s(toward))),
    );
  });

  // Fails if a point past the end that is the new highest rate stops
  // changing the candidate stream (the same seed would then give the same
  // run), or if it changes the distribution: the last five seconds still
  // hold about 7,750 arrivals.
  it("changes the draws, not the distribution, through a new highest point", () => {
    const higher = [...toward, { atMs: 60_000, requestsPerSec: 3_000 }];
    const times = arrivals(process(cutAt45s(higher)));
    const lastFiveSeconds = times.filter((t) => t >= 40_000);

    expect(times).not.toEqual(arrivals(process(cutAt45s(toward))));
    expect(lastFiveSeconds.length).toBeGreaterThan(7_400);
    expect(lastFiveSeconds.length).toBeLessThan(8_100);
  });

  // Fails if a profile that ends before the run stops holding its last rate:
  // from 10 s to 20 s, 500 requests/s gives about 5,000 arrivals, and none
  // (or a falling count) would mean the rate dropped to zero.
  it("holds the last rate to the end when the profile ends early", () => {
    const early = workload({
      durationMs: 20_000,
      profile: [
        { atMs: 0, requestsPerSec: 100 },
        { atMs: 10_000, requestsPerSec: 500 },
      ],
    });
    const times = arrivals(process(early));
    const heldPart = times.filter((t) => t >= 10_000);

    expect(rateAt(early.profile, 20_000)).toBe(500);
    // A Poisson count of 5,000 has a standard deviation of about 71.
    expect(heldPart.length).toBeGreaterThan(4_700);
    expect(heldPart.length).toBeLessThan(5_300);
  });

  // Fails if a point exactly at the end, on the same line, changes an
  // arrival.
  it("changes no arrival through a point on the line at the end", () => {
    const withEnd = [
      { atMs: 40_000, requestsPerSec: 2_000 },
      { atMs: 45_000, requestsPerSec: 1_100 },
      { atMs: 50_000, requestsPerSec: 200 },
    ];

    expect(arrivals(process(cutAt45s(withEnd)))).toEqual(
      arrivals(process(cutAt45s(toward))),
    );
  });

  // Fails if the same workload and seed give different runs, which is all
  // the seed's help claims, or if the seed makes no difference.
  it("gives the same arrivals for the same workload and seed", () => {
    const w = cutAt45s(toward);

    expect(arrivals(process(w, 9))).toEqual(arrivals(process(w, 9)));
    expect(arrivals(process(w, 9))).not.toEqual(arrivals(process(w, 10)));
  });
});
