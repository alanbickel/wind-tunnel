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
  SeriesStatus,
  TimeSeries,
  TimeSeriesContent,
  TimeSeriesPoint,
} from "../charts/time-series";

/** Milliseconds of simulated time as seconds, for chart axes. */
export function secondsOf(timeMs: number): number {
  return timeMs / 1_000;
}

/** What the Run tab draws of a run over time. */
export interface RunCharts {
  /** The whole run at a glance: requests that succeeded and failed. */
  readonly timeline: TimeSeriesContent;
  /** The full set, in order: requests, latency, work in progress, work waiting. */
  readonly charts: readonly TimeSeriesContent[];
}

/**
 * The run's timeline and charts: requests, workflow latency, and each
 * component's work in progress and queue. The timeline's lines are the
 * requests chart's own, so the two can't disagree. Every series is present
 * from the first snapshot, in a fixed order, so lines keep their colors as
 * the run fills in.
 */
export function runCharts(run: RunSoFar): RunCharts {
  const requests = requestsChart(run.snapshots);
  return {
    timeline: timelineOf(requests),
    charts: [
      requests,
      latencyChart(run),
      componentChart(run, BUSY_CHART),
      componentChart(run, QUEUE_CHART),
    ],
  };
}

/** Picks a series' value at one moment; undefined leaves a gap. */
type ValueAt<T> = (item: T) => number | undefined;

interface SeriesInput<T> {
  readonly id: string;
  readonly label: string;
  readonly status?: SeriesStatus;
  readonly items: readonly T[];
  readonly timeSecOf: (item: T) => number;
  readonly valueAt: ValueAt<T>;
}

function seriesOf<T>(input: SeriesInput<T>): TimeSeries {
  const { id, label, status, items, timeSecOf, valueAt } = input;
  const points = items.flatMap((item): TimeSeriesPoint[] => {
    const value = valueAt(item);
    return value === undefined ? [] : [{ timeSec: timeSecOf(item), value }];
  });
  return { id, label, status, points };
}

/** A line of the requests chart: one of the counts in a `WorkflowSecond`. */
type RequestLine = Exclude<keyof WorkflowSecond, "snapshot">;

/** In legend order, which also fixes the color of each line without a status. */
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

/** The lines that mean good or bad, drawn in their status's color. */
const REQUEST_STATUSES: Partial<Record<RequestLine, SeriesStatus>> = {
  succeeded: "ok",
  failed: "error",
};

/** The requests chart's lines the timeline shows. */
const TIMELINE_LINES: readonly RequestLine[] = ["succeeded", "failed"];

function requestsChart(
  snapshots: readonly MetricsSnapshot[],
): TimeSeriesContent {
  const seconds = workflowSeconds(snapshots);
  const series = REQUEST_LINES.map((line) =>
    seriesOf({
      id: line,
      label: REQUEST_LABELS[line],
      status: REQUEST_STATUSES[line],
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

/** The requests chart's succeeded and failed lines, on a chart of their own. */
function timelineOf(requests: TimeSeriesContent): TimeSeriesContent {
  return {
    title: "Requests that succeeded and failed, per second",
    unit: requests.unit,
    series: requests.series.filter((series) =>
      TIMELINE_LINES.some((line) => line === series.id),
    ),
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
