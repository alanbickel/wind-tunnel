import type { MetricsSnapshot } from "../../domain/metrics/metrics-snapshot";
import {
  addRequestCounts,
  requestsInProgress,
  type RequestCounts,
} from "./counts";

/** Requests across all workflows in one snapshot's second. */
export interface WorkflowSecond extends RequestCounts {
  /** The snapshot the counts come from, for its time and other metrics. */
  readonly snapshot: MetricsSnapshot;
  /**
   * Requests unanswered at the end of the second. `started` counts those
   * that arrived in the second; `succeeded` and `failed` count those
   * answered in it, whenever they started.
   */
  readonly inProgress: number;
}

/**
 * Each snapshot's request counts, with the running total still in progress:
 * the previous second's, plus started, minus succeeded and failed. The last
 * second's `inProgress` matches the workflow totals.
 */
export function workflowSeconds(
  snapshots: readonly MetricsSnapshot[],
): WorkflowSecond[] {
  let inProgress = 0;
  return snapshots.map((snapshot) => {
    const counts = addRequestCounts(Object.values(snapshot.workflows));
    inProgress += requestsInProgress(counts);
    return { snapshot, ...counts, inProgress };
  });
}
