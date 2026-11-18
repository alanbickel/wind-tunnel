import type { ChartSize } from "./time-series";

/** A plot's size, as an inline style. */
export interface PlotStyle {
  readonly width: string;
  readonly height: number;
}

const PLOT_HEIGHTS_PX: Record<ChartSize, number> = {
  full: 260,
  compact: 180,
};

/**
 * The plot's size. The stand-in shown while Recharts loads takes the same,
 * so the table below doesn't jump when the lines arrive.
 */
export function plotStyle(size: ChartSize): PlotStyle {
  return { width: "100%", height: PLOT_HEIGHTS_PX[size] };
}

/** A full-size plot's style, for charts that have only the one size. */
export const PLOT_STYLE = plotStyle("full");
