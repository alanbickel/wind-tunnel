import type { TimeSeries } from "./time-series";

/**
 * One moment's values across every series, keyed by series ID, which is the
 * shape Recharts and the chart's table both read. A series with no point at
 * this time has no key.
 */
export interface ChartRow {
  readonly timeSec: number;
  readonly values: Readonly<Record<string, number>>;
}

/** The series' points merged into one row per distinct time, in time order. */
export function chartRows(series: readonly TimeSeries[]): ChartRow[] {
  const rows = new Map<number, Record<string, number>>();
  for (const { id, points } of series) {
    for (const { timeSec, value } of points) {
      const values = rows.get(timeSec) ?? {};
      values[id] = value;
      rows.set(timeSec, values);
    }
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([timeSec, values]) => ({ timeSec, values }));
}
