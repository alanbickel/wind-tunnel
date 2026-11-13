import { describe, expect, it } from "vitest";
import { workloadSends } from "../../application/details/workload-sends";
import type { RunGetter } from "./testing/use-run";

/**
 * How far a run's started requests may be from what "What this sends" says,
 * as a fraction of it. Arrivals are Poisson, so a run's count has a standard
 * deviation of the square root of the expected count: about 257 of 66,000,
 * 0.4%. 2% is five of them, so no seed fails the total by chance. A smaller
 * part has a larger relative spread, so each workflow's figure gets five of
 * its own standard deviations (see `withinFiveDeviations`).
 */
export const SENDS_TOLERANCE = 0.02;

/** Whether a count is within five Poisson standard deviations of its expected count. */
function withinFiveDeviations(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) < 5 * Math.sqrt(expected);
}

/** What the doc quotes (UX design §8): Lunch rush on the reading seed. */
const QUOTED_SUMMARY = 66_000;
const QUOTED_RUN_STARTS = 65_974;

/** What a workload says it sends against what its run starts. */
export function describeSendsMatchRun(getRun: RunGetter): void {
  describe("what the workload says it sends", () => {
    // Fails if the summary stops following the profile the engine runs, or
    // the run's count drifts from the quoted pair in UX design §8.
    it("is about what the run starts, as the design doc quotes", () => {
      const { project, workloadId, totals } = getRun();
      const workload = project.workloads.find((w) => w.id === workloadId);
      const sends = workloadSends(
        workload ?? { profile: [], durationMs: 0, mix: [] },
      );
      const started = Object.values(totals.workflows).reduce(
        (sum, w) => sum + w.started,
        0,
      );

      expect(sends?.totalRequests).toBe(QUOTED_SUMMARY);
      expect(started).toBe(QUOTED_RUN_STARTS);
      expect(Math.abs(started - QUOTED_SUMMARY)).toBeLessThan(
        QUOTED_SUMMARY * SENDS_TOLERANCE,
      );
    });

    // Fails if a workflow's figure isn't its mix share of the run's own
    // started requests, within five standard deviations of its own count.
    it("gives each workflow about what its run starts", () => {
      const { project, workloadId, totals } = getRun();
      const workload = project.workloads.find((w) => w.id === workloadId);
      const parts = workloadSends(
        workload ?? { profile: [], durationMs: 0, mix: [] },
      )?.perEntryRequests;

      const started = workload?.mix.map(
        (entry) => totals.workflows[entry.workflowId]?.started ?? 0,
      );

      expect(parts).toHaveLength(started?.length ?? -1);
      parts?.forEach((part, index) => {
        const actual = started?.[index] ?? 0;
        expect(withinFiveDeviations(actual, part)).toBe(true);
      });
    });
  });
}
