import type {
  ComponentMetrics,
  MetricsSnapshot,
  WorkflowMetrics,
} from "../../domain/metrics/metrics-snapshot";

/** A component that did nothing; override the fields a test needs. */
export function componentMetrics(
  overrides: Partial<ComponentMetrics> = {},
): ComponentMetrics {
  return {
    arrivals: 0,
    completed: 0,
    failed: 0,
    rejected: 0,
    timeouts: 0,
    latency: undefined,
    inProgress: 0,
    queueDepth: 0,
    peakInProgress: 0,
    peakQueueDepth: 0,
    asyncSucceeded: 0,
    asyncFailed: 0,
    asyncLatency: undefined,
    gauges: {},
    counters: {},
    ...overrides,
  };
}

/** A workflow with no requests; override the fields a test needs. */
export function workflowMetrics(
  overrides: Partial<WorkflowMetrics> = {},
): WorkflowMetrics {
  return {
    started: 0,
    succeeded: 0,
    failed: 0,
    failures: {},
    latency: undefined,
    ...overrides,
  };
}

/** What happened in one second of a `sampleRecord` run. */
export interface SampleSecond {
  /** 1 for the first second, `[0, 1000)`. */
  readonly second: number;
  readonly read?: Partial<WorkflowMetrics>;
  readonly api?: Partial<ComponentMetrics>;
  readonly fn?: Partial<ComponentMetrics>;
  readonly table?: Partial<ComponentMetrics>;
}

/**
 * A snapshot of `sampleRecord`'s project: its one workflow (`read`) and its
 * three components (`api`, `fn`, `table`), idle unless given.
 */
export function sampleSnapshot(second: SampleSecond): MetricsSnapshot {
  return {
    startMs: (second.second - 1) * 1_000,
    endMs: second.second * 1_000,
    components: {
      api: componentMetrics(second.api),
      fn: componentMetrics(second.fn),
      table: componentMetrics(second.table),
    },
    workflows: { read: workflowMetrics(second.read) },
  };
}
