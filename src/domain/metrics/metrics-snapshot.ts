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
  /** Type-specific values at the window's end. */
  readonly gauges: Readonly<Record<string, number>>;
  /** Type-specific counts during the window, e.g. Lambda `coldStarts`. */
  readonly counters: Readonly<Record<string, number>>;
  /**
   * The component's own limits, such as RDS `connections`, each with how
   * much of it was used. In the component's order; empty if it has none.
   */
  readonly limits: readonly LimitUse[];
}

/**
 * How much of one of its limits a component used. `peak / limit` is the
 * share used at the busiest moment; at 1 or more, requests were refused or
 * left waiting for the limit. Units depend on `kind`: slots for
 * concurrency, tokens per second for rate.
 */
export type LimitUse = ConcurrencyLimitUse | RateLimitUse;

/**
 * Slots held out of a fixed number, e.g. RDS `connections` or Lambda
 * `concurrency`. `peak` never exceeds `limit`; reaching it means the
 * next request was queued or rejected.
 */
export interface ConcurrencyLimitUse {
  readonly kind: "concurrency";
  /** camelCase and unique within the component, e.g. `connections`. */
  readonly name: string;
  /** Most slots that can be held at once. */
  readonly limit: number;
  /** Slots held at the window's end. */
  readonly current: number;
  /** Most slots held at once during the window. */
  readonly peak: number;
}

/**
 * Tokens taken against a sustained rate, e.g. API Gateway's `requestRate`
 * or DynamoDB's `readUnits`, per second. Saved-up burst tokens let a
 * window go over `limit`, by at most `burst` tokens in all.
 */
export interface RateLimitUse {
  readonly kind: "rate";
  /** camelCase and unique within the component, e.g. `readUnits`. */
  readonly name: string;
  /** The sustained rate: tokens added per second. */
  readonly limit: number;
  /** Most tokens saved up for a burst. */
  readonly burst: number;
  /** Tokens taken per second over the window. */
  readonly current: number;
  /** The same as `current` for one window; in the totals, the busiest window's. */
  readonly peak: number;
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
