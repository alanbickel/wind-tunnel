import { describe, expect, it } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import type { TimeSeriesContent } from "../charts/time-series";
import { runCharts } from "./run-charts";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";

const { project } = sampleRecord;

function chartTitled(charts: readonly TimeSeriesContent[], title: string) {
  const chart = charts.find((c) => c.title.startsWith(title));
  if (chart === undefined) throw new Error(`No chart titled ${title}`);
  return chart;
}

function valuesOf(chart: TimeSeriesContent, seriesId: string) {
  const series = chart.series.find((s) => s.id === seriesId);
  return series?.points.map((p) => [p.timeSec, p.value]);
}

const latency = { count: 2, p50Ms: 10, p95Ms: 20, p99Ms: 30, maxMs: 40 };

const snapshots = [
  sampleSnapshot({ second: 1, read: { started: 5, succeeded: 2, latency } }),
  sampleSnapshot({
    second: 2,
    read: { started: 3, succeeded: 1, failed: 1 },
    fn: { peakInProgress: 7, peakQueueDepth: 2 },
  }),
];

describe("runCharts", () => {
  // Fails if a series plots the running total instead of the second's
  // count, or in progress isn't carried from second to second.
  it("counts requests per second, with the running total in progress", () => {
    const requests = chartTitled(
      runCharts({ project, workloadId: "steady", snapshots }).charts,
      "Requests",
    );

    expect(valuesOf(requests, "started")).toEqual([
      [1, 5],
      [2, 3],
    ]);
    expect(valuesOf(requests, "succeeded")).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(valuesOf(requests, "failed")).toEqual([
      [1, 0],
      [2, 1],
    ]);
    // 5 - 2 = 3, then 3 + 3 - 1 - 1 = 4.
    expect(valuesOf(requests, "inProgress")).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });

  // Fails if a second without latency is plotted as 0 instead of left out.
  it("leaves a gap in latency for a second with no successful request", () => {
    const { charts } = runCharts({ project, workloadId: "steady", snapshots });

    const latencyChart = chartTitled(charts, "Latency");

    expect(latencyChart.unit).toBe("ms");
    expect(valuesOf(latencyChart, "read")).toEqual([[1, 30]]);
  });

  // Fails if a component's series appears only once it has work, which
  // would shift the colors of the series after it.
  it("draws every component from the start, so colors don't shift", () => {
    const first = runCharts({
      project,
      workloadId: "steady",
      snapshots: snapshots.slice(0, 1),
    }).charts;
    const busy = chartTitled(first, "Work in progress");

    expect(busy.series.map((s) => s.label)).toEqual([
      "API",
      "Function",
      "Table",
    ]);
    const all = runCharts({ project, workloadId: "steady", snapshots }).charts;
    expect(valuesOf(chartTitled(all, "Work in progress"), "fn")).toEqual([
      [1, 0],
      [2, 7],
    ]);
    expect(valuesOf(chartTitled(all, "Work waiting"), "fn")).toEqual([
      [1, 0],
      [2, 2],
    ]);
  });

  // Fails if the timeline reads anything but the requests chart's
  // Succeeded and Failed lines, such as Started, or its own sums.
  it("draws the timeline from the requests chart's succeeded and failed lines", () => {
    const { timeline, charts } = runCharts({
      project,
      workloadId: "steady",
      snapshots,
    });
    const requests = chartTitled(charts, "Requests");

    expect(timeline.series.map((s) => s.label)).toEqual([
      "Succeeded",
      "Failed",
    ]);
    expect(timeline.unit).toBe(requests.unit);
    expect(timeline.series).toEqual(
      requests.series.filter((s) => ["succeeded", "failed"].includes(s.id)),
    );
    expect(valuesOf(timeline, "failed")).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  // Fails if Succeeded or Failed lose their status, so they take the
  // colors of their places (orange and aqua), or another line gets one.
  it("marks Succeeded ok and Failed error, and no other request line", () => {
    const requests = chartTitled(
      runCharts({ project, workloadId: "steady", snapshots }).charts,
      "Requests",
    );

    expect(requests.series.map((s) => [s.id, s.status])).toEqual([
      ["started", undefined],
      ["succeeded", "ok"],
      ["failed", "error"],
      ["inProgress", undefined],
    ]);
  });

  // Fails if a chart, or a chart's series, is missing until the first
  // snapshot arrives.
  it("has every chart's series, with no points, before the first snapshot", () => {
    const { timeline, charts } = runCharts({
      project,
      workloadId: "steady",
      snapshots: [],
    });

    expect(charts).toHaveLength(4);
    for (const chart of [timeline, ...charts]) {
      expect(chart.series.length).toBeGreaterThan(0);
      expect(chart.series.every((s) => s.points.length === 0)).toBe(true);
    }
  });
});
