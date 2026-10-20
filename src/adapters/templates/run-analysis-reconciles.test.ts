import { beforeAll, describe, expect, it } from "vitest";
import {
  allWorkflows,
  componentTotals,
  workflowTotals,
} from "../../application/run-analysis/run-totals";
import { limitPeaks } from "../../application/run-analysis/limit-peaks";
import type { RunSoFar } from "../../application/run-analysis/run-so-far";
import { workflowSeconds } from "../../application/run-analysis/workflow-seconds";
import type { MetricsSnapshot } from "../../domain/metrics/metrics-collector";
import {
  componentIn,
  workflowIn,
} from "../../domain/metrics/testing/snapshot-lookups";
import type { Project } from "../../domain/model/project";
import templateA from "./template-a.json";
import templateB from "./template-b.json";
import { RUN_TIMEOUT_MS, runTemplate } from "./testing/run-template";

// The run panel and the CLI report add up the snapshots with the shared
// functions in `application/run-analysis/`. These tests check those sums
// against the collector's own totals, which it counts separately, so a bug
// in either shows up here. They live in `adapters/` rather than beside the
// functions because loading a template needs `loadProject`.

describe.each([
  ["template-a", templateA],
  ["template-b", templateB],
])("%s's run analysis reconciles", (_, template) => {
  let project: Project;
  let totals: MetricsSnapshot;
  let snapshots: readonly MetricsSnapshot[];
  let finished: RunSoFar;
  beforeAll(() => {
    ({ project, totals, snapshots } = runTemplate(template));
    finished = { project, snapshots };
  }, RUN_TIMEOUT_MS);

  // Fails if `workflowTotals` drops a snapshot or a count (e.g. summing
  // `succeeded` into `failed`).
  it("adds up each workflow's snapshots to the collector's totals", () => {
    for (const row of workflowTotals(finished)) {
      const expected = workflowIn(totals, row.id);
      expect(row, row.id).toMatchObject({
        started: expected.started,
        succeeded: expected.succeeded,
        failed: expected.failed,
      });
    }
  });

  // Fails if `componentTotals` drops a snapshot or a count (e.g. leaves out
  // `rejected`).
  it("adds up each component's snapshots to the collector's totals", () => {
    for (const row of componentTotals(finished)) {
      const expected = componentIn(totals, row.id);
      expect(row, row.id).toMatchObject({
        arrivals: expected.arrivals,
        completed: expected.completed,
        failed: expected.failed,
        rejected: expected.rejected,
      });
    }
  });

  // Fails if `requestsInProgress` or `unfinishedWork` subtracts a count
  // twice, or if the per-second running total resets each second.
  it("never shows a negative amount in progress or unfinished", () => {
    for (let count = 1; count <= snapshots.length; count++) {
      const soFar = { project, snapshots: snapshots.slice(0, count) };
      for (const row of workflowTotals(soFar)) {
        expect(row.inProgress, row.id).toBeGreaterThanOrEqual(0);
      }
      for (const row of componentTotals(soFar)) {
        expect(row.unfinished, row.id).toBeGreaterThanOrEqual(0);
      }
    }
    for (const second of workflowSeconds(snapshots)) {
      expect(second.inProgress).toBeGreaterThanOrEqual(0);
    }
  });

  // Fails if "in progress" stops meaning requests still unanswered at the
  // entry point, e.g. if `allWorkflows` or the per-second running total
  // leaves out failed requests.
  it("matches requests in progress to the work unfinished at the entry point", () => {
    // Every workflow starts at `api` with no retries, so each user request
    // is exactly one arrival there.
    const atApi = componentIn(totals, "api").inProgress;
    expect(atApi).toBeGreaterThan(0);
    expect(allWorkflows(workflowTotals(finished)).inProgress).toBe(atApi);
    expect(workflowSeconds(snapshots).at(-1)?.inProgress).toBe(atApi);
  });

  // Fails if `limitPeaks` drops a limit or takes a peak other than the
  // highest, which the collector's totals keep separately.
  it("matches each limit's peak to the collector's totals", () => {
    const expected = Object.entries(totals.components).flatMap(([id, c]) =>
      c.limits.map((limit) => [`${id} ${limit.name}`, limit.limit, limit.peak]),
    );
    const rows = limitPeaks(finished).map((r) => [r.id, r.limit, r.peak]);
    expect(rows).toEqual(expected);
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });
});
