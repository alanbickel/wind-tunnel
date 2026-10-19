// The charts' own types (ADR-0011). Consumers describe a chart in these
// terms; only this folder knows they become Recharts props.

/** One value at one moment of simulated time. */
export interface TimeSeriesPoint {
  /** Simulated seconds since the run started, e.g. the end of a snapshot. */
  readonly timeSec: number;
  readonly value: number;
}

/** One line on a chart, such as one component's work in progress. */
export interface TimeSeries {
  readonly id: string;
  /** Names the line in the legend, tooltip, and table. */
  readonly label: string;
  /** In time order. A time with no point leaves a gap in the line. */
  readonly points: readonly TimeSeriesPoint[];
}

/** Everything a `TimeSeriesChart` shows. */
export interface TimeSeriesContent {
  readonly title: string;
  /** What the y-axis counts, e.g. "requests" or "ms". */
  readonly unit: string;
  /**
   * Each series keeps its color for as long as its place in this list, so
   * keep the order stable while a chart updates.
   */
  readonly series: readonly TimeSeries[];
}
