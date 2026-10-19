import type { MetricsSnapshot } from "../../domain/metrics/metrics-snapshot";

/** Requests across all workflows in one snapshot's second. */
export interface WorkflowSecond {
  /** The end of the second, in simulated seconds since the run started. */
  readonly timeSec: number;
  /** Requests that arrived in the second. */
  readonly started: number;
  /** Requests answered in the second, whenever they started. */
  readonly succeeded: number;
  readonly failed: number;
  /** Requests unanswered at the end of the second. */
  readonly inProgress: number;
}

/**
 * Each snapshot's request counts, with the running total still in progress:
 * the previous second's, plus started, minus succeeded and failed.
 */
export function workflowSeconds(
  snapshots: readonly MetricsSnapshot[],
): WorkflowSecond[] {
  let inProgress = 0;
  return snapshots.map((snapshot) => {
    const counts = requestCounts(snapshot);
    inProgress += counts.started - counts.succeeded - counts.failed;
    return { timeSec: secondsOf(snapshot.endMs), ...counts, inProgress };
  });
}

/** The counts of a `WorkflowSecond`, without the running total. */
type RequestCounts = Pick<WorkflowSecond, "started" | "succeeded" | "failed">;

function requestCounts(snapshot: MetricsSnapshot): RequestCounts {
  const all = Object.values(snapshot.workflows);
  return {
    started: sum(all.map((w) => w.started)),
    succeeded: sum(all.map((w) => w.succeeded)),
    failed: sum(all.map((w) => w.failed)),
  };
}

/** Milliseconds of simulated time as seconds, for chart axes. */
export function secondsOf(timeMs: number): number {
  return timeMs / 1_000;
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
