import { seriesColor } from "./series-colors";
import type { SeriesStatus, TimeSeries } from "./time-series";

/** How one line is drawn: its color, and its dash pattern if it has one. */
export interface SeriesLook {
  /** A CSS color, or a token reference that follows the theme. */
  readonly stroke: string;
  /** An SVG dash pattern; undefined draws the line solid. */
  readonly strokeDasharray?: string;
}

// Red and green are hard to tell apart for many color-blind readers (the
// dataviz validator puts the dark theme's pair at a ΔE of 2.7 for deutan),
// so the failed line is dashed too, and the legend's swatch shows the dash.
const STATUS_LOOKS: Record<SeriesStatus, SeriesLook> = {
  ok: { stroke: "var(--color-status-ok)" },
  error: { stroke: "var(--color-status-error)", strokeDasharray: "6 3" },
};

/** Where a series sits in its chart's list, with the series. */
export interface SeriesLookInput {
  readonly series: TimeSeries;
  readonly index: number;
}

/**
 * How the series is drawn: by its status if it has one, otherwise in the
 * series color for its place in the list.
 */
export function seriesLook({ series, index }: SeriesLookInput): SeriesLook {
  if (series.status !== undefined) return STATUS_LOOKS[series.status];
  return { stroke: seriesColor(index) };
}
