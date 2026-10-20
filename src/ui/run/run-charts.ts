import type {
  ComponentMetrics,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-snapshot";
import type { RunSoFar } from "../../application/run-analysis/run-so-far";
import {
  workflowSeconds,
  type WorkflowSecond,
} from "../../application/run-analysis/workflow-seconds";
import type {
  TimeSeries,
  TimeSeriesContent,
  TimeSeriesPoint,
} from "../charts/time-series";

/** Milliseconds of simulated time as seconds, for chart axes. */
export function secondsOf(timeMs: number): number {
  return timeMs / 1_000;
}

/**
 * The run's charts: requests, workflow latency, and each component's work
 * in progress and queue. Every series is present from the first snapshot,
 * in a fixed order, so lines keep their colors as the run fills in.
 */
export function runCharts(run: RunSoFar): TimeSeriesContent[] {
  return [
    requestsChart(run.snapshots),
    latencyChart(run),
    componentChart(run, BUSY_CHART),
    componentChart(run, QUEUE_CHART),
  ];
}

/** Picks a series' value at one moment; undefined leaves a gap. */
type ValueAt<T> = (item: T) => number | undefined;

interface SeriesInput<T> {
  readonly id: string;
  readonly label: string;
  readonly items: readonly T[];
  readonly timeSecOf: (item: T) => number;
  readonly valueAt: ValueAt<T>;
}

function seriesOf<T>(input: SeriesInput<T>): TimeSeries {
  const { id, label, items, timeSecOf, valueAt } = input;
  const points = items.flatMap((item): TimeSeriesPoint[] => {
    const value = valueAt(item);
    return value === undefined ? [] : [{ timeSec: timeSecOf(item), value }];
  });
  return { id, label, points };
}

/** A line of the requests chart: one of the counts in a `WorkflowSecond`. */
type RequestLine = Exclude<keyof WorkflowSecond, "snapshot">;

/** In legend order, which also fixes each line's color. */
const REQUEST_LINES: readonly RequestLine[] = [
  "started",
  "succeeded",
  "failed",
  "inProgress",
];

const REQUEST_LABELS: Record<RequestLine, string> = {
  started: "Started",
  succeeded: "Succeeded",
  failed: "Failed",
  inProgress: "In progress (at end of second)",
};

function requestsChart(
  snapshots: readonly MetricsSnapshot[],
): TimeSeriesContent {
  const seconds = workflowSeconds(snapshots);
  const series = REQUEST_LINES.map((line) =>
    seriesOf({
      id: line,
      label: REQUEST_LABELS[line],
      items: seconds,
      timeSecOf: (second) => snapshotTimeSec(second.snapshot),
      valueAt: (second) => second[line],
    }),
  );
  return {
    title: "Requests per second, all workflows",
    unit: "requests",
    series,
  };
}

function snapshotTimeSec(snapshot: MetricsSnapshot): number {
  return secondsOf(snapshot.endMs);
}

/** p99 latency of each workflow's successful requests, second by second. */
function latencyChart({ project, snapshots }: RunSoFar): TimeSeriesContent {
  const series = project.workflows.map(({ id, name }) =>
    seriesOf({
      id,
      label: name,
      items: snapshots,
      timeSecOf: snapshotTimeSec,
      valueAt: (snapshot) => snapshot.workflows[id]?.latency?.p99Ms,
    }),
  );
  return {
    title: "Latency of successful requests, p99",
    unit: "ms",
    series,
  };
}

/** A chart with one line per component, reading one of its metrics. */
interface ComponentChartSpec {
  readonly title: string;
  readonly unit: string;
  readonly valueOf: (metrics: ComponentMetrics) => number;
}

const BUSY_CHART: ComponentChartSpec = {
  title: "Work in progress per component, peak each second",
  unit: "requests",
  valueOf: (metrics) => metrics.peakInProgress,
};

const QUEUE_CHART: ComponentChartSpec = {
  title: "Work waiting per component, peak each second",
  unit: "requests",
  valueOf: (metrics) => metrics.peakQueueDepth,
};

function componentChart(
  { project, snapshots }: RunSoFar,
  { title, unit, valueOf }: ComponentChartSpec,
): TimeSeriesContent {
  const series = project.architecture.components.map(({ id, name }) =>
    seriesOf({
      id,
      label: name,
      items: snapshots,
      timeSecOf: snapshotTimeSec,
      valueAt: (snapshot) => {
        const metrics = snapshot.components[id];
        return metrics === undefined ? undefined : valueOf(metrics);
      },
    }),
  );
  return { title, unit, series };
}
