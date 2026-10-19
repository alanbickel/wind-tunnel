import type {
  ComponentMetrics,
  WorkflowMetrics,
} from "../../domain/metrics/metrics-snapshot";
import type { RunSoFar } from "./run-charts";
import { sum } from "./workflow-seconds";

/** Requests so far: started = succeeded + failed + inProgress. */
export interface WorkflowTotals {
  readonly id: string;
  readonly label: string;
  readonly started: number;
  readonly succeeded: number;
  readonly failed: number;
  /** Started and not yet answered. */
  readonly inProgress: number;
}

/**
 * One component's work so far:
 * arrivals = completed + failed + rejected + unfinished.
 */
export interface ComponentTotals {
  readonly id: string;
  readonly label: string;
  readonly arrivals: number;
  readonly completed: number;
  readonly failed: number;
  readonly rejected: number;
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
    return { id, label: name, ...requestCounts(all) };
  });
}

/** The workflows' rows added up, for the table's last row. */
export function allWorkflows(rows: readonly WorkflowTotals[]): WorkflowTotals {
  return {
    id: "all",
    label: "All workflows",
    started: sum(rows.map((r) => r.started)),
    succeeded: sum(rows.map((r) => r.succeeded)),
    failed: sum(rows.map((r) => r.failed)),
    inProgress: sum(rows.map((r) => r.inProgress)),
  };
}

/** Each component's totals over the snapshots so far, in architecture order. */
export function componentTotals({
  project,
  snapshots,
}: RunSoFar): ComponentTotals[] {
  return project.architecture.components.map(({ id, name }) => {
    const all = snapshots.flatMap((s) => present(s.components[id]));
    return { id, label: name, ...workCounts(all) };
  });
}

type RequestCounts = Omit<WorkflowTotals, "id" | "label">;

function requestCounts(all: readonly WorkflowMetrics[]): RequestCounts {
  const started = sum(all.map((w) => w.started));
  const succeeded = sum(all.map((w) => w.succeeded));
  const failed = sum(all.map((w) => w.failed));
  return {
    started,
    succeeded,
    failed,
    inProgress: started - succeeded - failed,
  };
}

type WorkCounts = Omit<ComponentTotals, "id" | "label">;

function workCounts(all: readonly ComponentMetrics[]): WorkCounts {
  const arrivals = sum(all.map((c) => c.arrivals));
  const completed = sum(all.map((c) => c.completed));
  const failed = sum(all.map((c) => c.failed));
  const rejected = sum(all.map((c) => c.rejected));
  const unfinished = arrivals - completed - failed - rejected;
  return { arrivals, completed, failed, rejected, unfinished };
}

/** The entry as a list of one, or none if it's missing. */
function present<T>(entry: T | undefined): T[] {
  return entry === undefined ? [] : [entry];
}
