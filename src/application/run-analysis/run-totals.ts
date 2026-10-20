import {
  addRequestCounts,
  addWorkCounts,
  requestsInProgress,
  unfinishedWork,
  type RequestCounts,
  type WorkCounts,
} from "./counts";
import type { RunSoFar } from "./run-so-far";

/** Requests so far: started = succeeded + failed + inProgress. */
export interface WorkflowTotals extends RequestCounts {
  readonly id: string;
  /** The workflow's name. */
  readonly label: string;
  /** Started and not yet answered. */
  readonly inProgress: number;
}

/**
 * One component's work so far:
 * arrivals = completed + failed + rejected + unfinished.
 */
export interface ComponentTotals extends WorkCounts {
  readonly id: string;
  /** The component's name. */
  readonly label: string;
  /** Arrived and still running or waiting. */
  readonly unfinished: number;
}

/** Each workflow's totals over the snapshots so far, in project order. */
export function workflowTotals({
  project,
  snapshots,
}: RunSoFar): WorkflowTotals[] {
  return project.workflows.map(({ id, name }) => {
    const all = snapshots.flatMap((s) => present(s.workflows[id]));
    return { id, label: name, ...withInProgress(addRequestCounts(all)) };
  });
}

/** The workflows' rows added up, so its own columns still reconcile. */
export function allWorkflows(rows: readonly WorkflowTotals[]): WorkflowTotals {
  return {
    id: "all",
    label: "All workflows",
    ...withInProgress(addRequestCounts(rows)),
  };
}

/** Each component's totals over the snapshots so far, in architecture order. */
export function componentTotals({
  project,
  snapshots,
}: RunSoFar): ComponentTotals[] {
  return project.architecture.components.map(({ id, name }) => {
    const all = snapshots.flatMap((s) => present(s.components[id]));
    const counts = addWorkCounts(all);
    return { id, label: name, ...counts, unfinished: unfinishedWork(counts) };
  });
}

/** The counts with the requests they leave in progress. */
type CountsInProgress = Omit<WorkflowTotals, "id" | "label">;

function withInProgress(counts: RequestCounts): CountsInProgress {
  return { ...counts, inProgress: requestsInProgress(counts) };
}

/** The entry as a list of one, or none if it's missing. */
function present<T>(entry: T | undefined): T[] {
  return entry === undefined ? [] : [entry];
}
