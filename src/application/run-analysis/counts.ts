/**
 * User requests started and answered. `WorkflowMetrics` is one; so is a
 * sum of them.
 */
export interface RequestCounts {
  readonly started: number;
  readonly succeeded: number;
  readonly failed: number;
}

/**
 * Work that arrived at a component and how it ended. `ComponentMetrics` is
 * one; so is a sum of them.
 */
export interface WorkCounts {
  readonly arrivals: number;
  readonly completed: number;
  readonly failed: number;
  readonly rejected: number;
}

/**
 * Requests started and not yet answered. Every report of "in progress"
 * comes from here, so the CLI and the browser can't disagree on it.
 */
export function requestsInProgress(counts: RequestCounts): number {
  return counts.started - counts.succeeded - counts.failed;
}

/**
 * Work that arrived and is still running or waiting: neither finished nor
 * rejected. For a queue, a message counts as completed once accepted, so
 * its backlog isn't unfinished work.
 */
export function unfinishedWork(counts: WorkCounts): number {
  return counts.arrivals - counts.completed - counts.failed - counts.rejected;
}

/** Adds up request counts, for example a workflow's over every second. */
export function addRequestCounts(all: readonly RequestCounts[]): RequestCounts {
  return {
    started: sum(all.map((c) => c.started)),
    succeeded: sum(all.map((c) => c.succeeded)),
    failed: sum(all.map((c) => c.failed)),
  };
}

/** Adds up work counts, for example a component's over every second. */
export function addWorkCounts(all: readonly WorkCounts[]): WorkCounts {
  return {
    arrivals: sum(all.map((c) => c.arrivals)),
    completed: sum(all.map((c) => c.completed)),
    failed: sum(all.map((c) => c.failed)),
    rejected: sum(all.map((c) => c.rejected)),
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
