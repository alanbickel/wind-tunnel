import type { ReactElement } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatValue } from "./format-value";
import { PLOT_STYLE } from "./plot-style";
import { rateRows, type RateLineContent } from "./rate-line";
import { seriesColor } from "./series-colors";

const GRID_COLOR = "var(--color-divider)";
const AXIS_COLOR = "var(--color-text-muted)";
const MUTED_COLOR = "var(--color-text-muted)";
const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
} as const;

export interface ProfilePlotProps {
  readonly line: RateLineContent;
}

/**
 * The profile's line, drawn by Recharts: solid to the run's end, dashed and
 * muted past it, with the end marked. Only `ProfileChart` renders it, and
 * loads it lazily. It's a picture: the accessibility layer, which would put
 * the chart in the tab order, is off, and the table is how it's read.
 */
export function ProfilePlot({ line }: ProfilePlotProps) {
  return (
    <LineChart
      responsive
      accessibilityLayer={false}
      style={PLOT_STYLE}
      data={rateRows(line)}
    >
      {frame()}
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        formatter={formatValue}
        labelFormatter={formatTime}
      />
      <ReferenceLine
        x={line.endSec}
        stroke={AXIS_COLOR}
        strokeDasharray="4 4"
      />
      {lines()}
    </LineChart>
  );
}

// Recharts reads the chart's children by type, so these return its elements
// rather than being components of their own.

/** The grid and both axes. */
function frame(): ReactElement[] {
  return [
    <CartesianGrid key="grid" stroke={GRID_COLOR} vertical={false} />,
    <XAxis
      key="x"
      dataKey="timeSec"
      type="number"
      domain={[0, "dataMax"]}
      unit=" s"
      stroke={AXIS_COLOR}
    />,
    <YAxis
      key="y"
      stroke={AXIS_COLOR}
      label={{ value: "requests/s", angle: -90, position: "insideLeft" }}
    />,
  ];
}

const LINE_PROPS = {
  strokeWidth: 2,
  dot: false,
  isAnimationActive: false,
} as const;

/** The line the run reads, solid, and the rest past its end, dashed and muted. */
function lines(): ReactElement[] {
  return [
    <Line
      key="within"
      {...LINE_PROPS}
      name="Request rate"
      dataKey="within"
      stroke={seriesColor(0)}
    />,
    <Line
      key="beyond"
      {...LINE_PROPS}
      name="After the run's end"
      dataKey="beyond"
      stroke={MUTED_COLOR}
      strokeDasharray="4 4"
    />,
  ];
}

function formatTime(timeSec: unknown): string {
  return `${String(timeSec)} s`;
}
