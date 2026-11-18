// The charts' own types (ADR-0011). Consumers describe a chart in these
// terms; only this folder knows they become Recharts props.

/** One value at one moment of simulated time. */
export interface TimeSeriesPoint {
  /** Simulated seconds since the run started, e.g. the end of a snapshot. */
  readonly timeSec: number;
  readonly value: number;
}

/**
 * What a line means, when it means good or bad: requests that succeeded
 * or failed. It's drawn in that status's color, which follows the theme,
 * and "error" is dashed too, so color is never the only cue.
 */
export type SeriesStatus = "ok" | "error";

/** One line on a chart, such as one component's work in progress. */
export interface TimeSeries {
  readonly id: string;
  /** Names the line in the legend, tooltip, and table. */
  readonly label: string;
  /**
   * The status the line shows, if any. A line without one takes the
   * series color for its place in the list.
   */
  readonly status?: SeriesStatus;
  /** In time order. A time with no point leaves a gap in the line. */
  readonly points: readonly TimeSeriesPoint[];
}

/** Everything a `TimeSeriesChart` shows. */
export interface TimeSeriesContent {
  readonly title: string;
  /** What the y-axis counts, e.g. "requests" or "ms". */
  readonly unit: string;
  /**
   * Each series without a status keeps its color for as long as its place
   * in this list, so keep the order stable while a chart updates.
   */
  readonly series: readonly TimeSeries[];
}

/**
 * How tall a chart's plot is: "full" for a chart read on its own, "compact"
 * for one that sits above others, such as the Run tab's timeline.
 */
export type ChartSize = "full" | "compact";
