import { describe, expect, it } from "vitest";
import type { Workload } from "../../domain/model/project";
import { workloadSends } from "./workload-sends";

type SendsInput = Pick<Workload, "profile" | "durationMs" | "mix">;

const LUNCH_RUSH: SendsInput = {
  durationMs: 60_000,
  profile: [
    { atMs: 0, requestsPerSec: 200 },
    { atMs: 10_000, requestsPerSec: 200 },
    { atMs: 20_000, requestsPerSec: 2000 },
    { atMs: 40_000, requestsPerSec: 2000 },
    { atMs: 50_000, requestsPerSec: 200 },
  ],
  mix: [
    { workflowId: "get-order", weight: 80 },
    { workflowId: "create-order", weight: 20 },
  ],
};

function sum(values: readonly number[] | undefined): number | undefined {
  return values?.reduce((total, value) => total + value, 0);
}

describe("workloadSends", () => {
  // Fails if the area under the line is computed some other way than the
  // trapezoids of the line the chart draws: Lunch rush is 2,000 + 11,000 +
  // 40,000 + 11,000 + 2,000 requests.
  it("adds up the area under the profile's line", () => {
    const sends = workloadSends(LUNCH_RUSH);

    expect(sends?.totalRequests).toBe(66_000);
    expect(sends?.peakRequestsPerSec).toBe(2000);
    expect(sends?.perEntryRequests).toEqual([52_800, 13_200]);
  });

  // Fails if the per-workflow figures are rounded one by one, so three equal
  // workflows split 100,000 as 33,000 each and lose a thousand.
  it("makes the per-workflow figures add up to the total exactly", () => {
    const mix = [1, 1, 1].map((weight, i) => ({
      workflowId: `w${String(i)}`,
      weight,
    }));
    const profile = [{ atMs: 0, requestsPerSec: 1000 }];

    const sends = workloadSends({ durationMs: 100_000, profile, mix });

    expect(sends?.totalRequests).toBe(100_000);
    expect(sum(sends?.perEntryRequests)).toBe(100_000);
    expect(sends?.perEntryRequests).toEqual([34_000, 33_000, 33_000]);
  });

  // Fails if the line past the run's end counts: this profile climbs to 900
  // after 10 s, but the run stops at 10 s, so only 10 s at 100 to 500 count.
  it("stops at the duration", () => {
    const sends = workloadSends({
      durationMs: 10_000,
      profile: [
        { atMs: 0, requestsPerSec: 100 },
        { atMs: 10_000, requestsPerSec: 500 },
        { atMs: 20_000, requestsPerSec: 900 },
      ],
      mix: [{ workflowId: "a", weight: 1 }],
    });

    expect(sends?.totalRequests).toBe(3000);
    expect(sends?.peakRequestsPerSec).toBe(500);
  });

  // Fails if a small total is rounded to a unit above 1, so 7 requests show
  // as 0 or 10.
  it("keeps every request of a small total", () => {
    const sends = workloadSends({
      durationMs: 7000,
      profile: [{ atMs: 0, requestsPerSec: 1 }],
      mix: [{ workflowId: "a", weight: 1 }],
    });

    expect(sends).toMatchObject({ totalRequests: 7, unit: 1 });
  });

  // Fails if an empty mix gets per-workflow figures, or a profile with no
  // points gets a summary of 0.
  it("has no per-workflow figures for an empty mix, and nothing without a profile", () => {
    expect(workloadSends({ ...LUNCH_RUSH, mix: [] })?.perEntryRequests).toBe(
      undefined,
    );
    expect(workloadSends({ ...LUNCH_RUSH, profile: [] })).toBeUndefined();
  });
});
