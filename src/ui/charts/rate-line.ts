// What `ProfileChart` is given (ADR-0011): the charts' own terms, so callers
// need not know the plot is Recharts.

/** One vertex of a rate line. */
export interface RateLinePoint {
  readonly timeSec: number;
  readonly requestsPerSec: number;
}

/** A request rate over a run, and where the run ends. */
export interface RateLineContent {
  /** The rate from the start to the run's end. */
  readonly within: readonly RateLinePoint[];
  /** The rate past the run's end, from the end on; drawn muted. May be empty. */
  readonly beyond: readonly RateLinePoint[];
  /** Where the run ends, in seconds; marked on the chart. */
  readonly endSec: number;
  /** Says where the run ends, e.g. "Run ends at 60 s". */
  readonly endText: string;
}

/** One row of the plot: the rate at a time, on the line or past the end. */
export interface RateRow {
  readonly timeSec: number;
  readonly within: number | undefined;
  readonly beyond: number | undefined;
}

/** The two lines as rows by time; the run's end, which both have, is one row. */
export function rateRows({ within, beyond }: RateLineContent): RateRow[] {
  const times = [...within, ...beyond].map((point) => point.timeSec);
  const ordered = [...new Set(times)].sort((a, b) => a - b);
  const valueAt = (points: readonly RateLinePoint[], timeSec: number) =>
    points.find((point) => point.timeSec === timeSec)?.requestsPerSec;
  return ordered.map((timeSec) => ({
    timeSec,
    within: valueAt(within, timeSec),
    beyond: valueAt(beyond, timeSec),
  }));
}
