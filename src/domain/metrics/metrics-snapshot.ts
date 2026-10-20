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
 * share used at the busiest moment, and never goes over 1. Whether the limit
 * ran out depends on its kind; `limitExhausted` has the rule. Units depend
 * on `kind`: slots for concurrency, tokens for a rate limit's bucket.
 */
export type LimitUse = ConcurrencyLimitUse | RateLimitUse;

/**
 * Slots held out of a fixed number, e.g. RDS `connections` or Lambda
 * `concurrency`. `peak` never exceeds `limit`; reaching it means a
 * request arriving then was queued or rejected.
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
 * A token bucket, e.g. API Gateway's `requestRate` or DynamoDB's
 * `readUnits`. Use is how far the bucket was drawn down: tokens missing
 * from a full bucket. A request finding less than one token is throttled,
 * so the bucket ran out once `peak` is over `limit - 1`. Whether it drains
 * depends on the flow: `takenPerSec` against `ratePerSec`.
 */
export interface RateLimitUse {
  readonly kind: "rate";
  /** camelCase and unique within the component, e.g. `readUnits`. */
  readonly name: string;
  /** The bucket's size, its burst: the most tokens it holds. */
  readonly limit: number;
  /** Tokens missing from a full bucket at the window's end. */
  readonly current: number;
  /** Most tokens missing at once during the window: its lowest level. */
  readonly peak: number;
  /** Tokens the bucket refills per second: the sustained rate. */
  readonly ratePerSec: number;
  /**
   * Tokens taken per second over the window. In the totals, the busiest
   * window's. Over `ratePerSec`, the bucket is draining.
   */
  readonly takenPerSec: number;
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
