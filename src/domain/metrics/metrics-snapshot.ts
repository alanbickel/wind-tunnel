import type { LatencySummary } from "./latency-histogram";

/** One component's activity over a window of simulated time. */
export interface ComponentMetrics {
  readonly arrivals: number;
  /** Work that finished successfully, including its nested calls. */
  readonly completed: number;
  /** Work that finished because a nested call failed. */
  readonly failed: number;
  readonly rejected: number;
  /** Callers that gave up waiting on this component. */
  readonly timeouts: number;
  /** Time from arrival to finish of `completed` work. */
  readonly latency: LatencySummary | undefined;
  /** At the window's end. */
  readonly inProgress: number;
  readonly queueDepth: number;
  /** Highest during the window. */
  readonly peakInProgress: number;
  readonly peakQueueDepth: number;
  /** Queue-like components: deliveries of async work that ended. */
  readonly asyncSucceeded: number;
  readonly asyncFailed: number;
  /** Time from the user's request to the end of a successful delivery. */
  readonly asyncLatency: LatencySummary | undefined;
  /** Type-specific values at the window's end, e.g. RDS `connectionsHeld`. */
  readonly gauges: Readonly<Record<string, number>>;
  /** Type-specific counts during the window, e.g. Lambda `coldStarts`. */
  readonly counters: Readonly<Record<string, number>>;
}

/** One workflow's user requests that got an answer during a window. */
export interface WorkflowMetrics {
  readonly started: number;
  readonly succeeded: number;
  readonly failed: number;
  /** Failed requests by cause, e.g. `"orders-db: too-many-connections"`. */
  readonly failures: Readonly<Record<string, number>>;
  /** End-to-end latency of `succeeded` requests. */
  readonly latency: LatencySummary | undefined;
}

/**
 * Metrics for a window of simulated time, `[startMs, endMs)`. The last
 * window of a run also includes events at exactly `endMs`.
 */
export interface MetricsSnapshot {
  readonly startMs: number;
  readonly endMs: number;
  /** Keyed by component ID, in architecture order. */
  readonly components: Readonly<Record<string, ComponentMetrics>>;
  /** Keyed by workflow ID. */
  readonly workflows: Readonly<Record<string, WorkflowMetrics>>;
}
