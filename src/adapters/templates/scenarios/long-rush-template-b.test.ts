import { beforeAll, describe, expect, it } from "vitest";
import type { MetricsRun } from "../../../domain/metrics/metrics-collector";
import { RUN_TIMEOUT_MS } from "../testing/run-template";
import type { MetricsSnapshot } from "../../../domain/metrics/metrics-collector";
import {
  componentIn,
  workflowIn,
} from "../../../domain/metrics/testing/snapshot-lookups";
import type { Project } from "../../../domain/model/project";
import {
  SEEDS,
  backlog,
  expectEveryRequestServed,
  projectB,
  runScenario,
} from "../testing/scenario-runs";

// Under the long rush, Template B still fails nothing but falls further behind
// on writes the longer the peak lasts. The long rush ramps from 200
// requests/s at 10 s to 2,000 by 20 s, holds until 140 s, is back to 200 by
// 150 s, and runs to 200 s so the queue can drain. Template A's long rush is
// in its own file so the two long runs can go to different test workers.

/** The snapshot of the second that ends `atSec` into the run. */
function secondEndingAt(
  snapshots: readonly MetricsSnapshot[],
  atSec: number,
): MetricsSnapshot {
  const snapshot = snapshots.find((s) => s.endMs === atSec * 1000);
  if (snapshot === undefined)
    throw new Error(`no second ending at ${String(atSec)}`);
  return snapshot;
}

function edgeTimeoutMs(project: Project, edgeId: string): number {
  const edge = project.architecture.edges.find((e) => e.id === edgeId);
  if (edge === undefined) throw new Error(edgeId);
  return edge.timeoutMs;
}

describe.each(SEEDS)("Template B in the long rush, seed %i", (seed) => {
  let b: MetricsRun;
  beforeAll(() => {
    b = runScenario({ project: projectB, workloadId: "long-rush", seed });
  }, RUN_TIMEOUT_MS);

  // Fails if orders-read's readUnitsPerSec drops to 1,500: the peak's reads
  // empty the token bucket, and throttled reads fail once their retries run
  // out.
  it("serves every request without a failure", () => {
    expectEveryRequestServed(b.totals);
  });

  // Writes arrive at about 400 a second at the peak, and 15 consumers
  // deliver about 315, so the backlog grows for as long as the peak lasts.
  // Fails if orders-queue's consumerMaxConcurrency rises to 20: the
  // consumers keep up.
  it("grows the backlog through the whole peak", () => {
    const sampledAtSec = [40, 60, 80, 100, 120, 140];
    const depths = sampledAtSec.map((sec) =>
      backlog(secondEndingAt(b.snapshots, sec)),
    );
    const growth = depths.slice(1).map((n, i) => n - (depths[i] ?? NaN));
    expect(Math.min(...growth)).toBeGreaterThan(0);
  });

  // Fails if the run ends at 180 s, before the backlog has drained.
  it("empties the backlog before the run ends", () => {
    expect(b.snapshots.map(backlog).at(-1)).toBe(0);
  });

  // A write that lands later than API Gateway's integration timeout is one
  // a synchronous API couldn't have waited for. Fails if the peak is cut to
  // 90 s: the slowest writes then land in about 25 s.
  it("answers writes quickly while the writes land later than API Gateway would wait", () => {
    const answered = workflowIn(b.totals, "create-order").latency?.p99Ms;
    const landed = componentIn(b.totals, "orders-queue").asyncLatency?.p99Ms;
    expect(answered).toBeLessThan(500);
    expect(landed).toBeGreaterThan(edgeTimeoutMs(projectB, "api->fn-api"));
  });
});
