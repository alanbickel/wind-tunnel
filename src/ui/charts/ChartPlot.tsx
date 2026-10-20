import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartRow } from "./chart-rows";
import { formatValue } from "./format-value";
import { PLOT_STYLE } from "./plot-style";
import { seriesColor } from "./series-colors";
import type { TimeSeries, TimeSeriesContent } from "./time-series";

// Recessive chrome, so the lines are the loudest thing on the chart. Token
// references resolve in the browser, so they follow the theme (ADR-0012).
const GRID_COLOR = "var(--color-divider)";
const AXIS_COLOR = "#898781";
const TIME_AXIS_PROPS = {
  dataKey: "timeSec",
  type: "number",
  domain: ["dataMin", "dataMax"],
  allowDecimals: false,
  unit: " s",
  stroke: AXIS_COLOR,
} as const;
// Recharts draws the tooltip on white by default.
const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
} as const;
// Recharts colors each tooltip row and legend label with its line's color,
// but series colors only reach 3:1, too faint for text: the hue stays on
// the line and the legend swatch.
const SERIES_TEXT_STYLE = { color: "var(--color-text)" } as const;

export interface ChartPlotProps {
  readonly content: TimeSeriesContent;
  readonly rows: readonly ChartRow[];
}

/**
 * The lines themselves, drawn by Recharts. Only `TimeSeriesChart` renders
 * it, and loads it lazily, so Recharts stays out of the app's first chunk.
 */
export function ChartPlot({ content, rows }: ChartPlotProps) {
  return (
    <LineChart responsive style={PLOT_STYLE} data={rows}>
      <CartesianGrid stroke={GRID_COLOR} vertical={false} />
      <XAxis {...TIME_AXIS_PROPS} />
      <YAxis
        stroke={AXIS_COLOR}
        tickFormatter={formatTick}
        label={{ value: content.unit, angle: -90, position: "insideLeft" }}
      />
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        itemStyle={SERIES_TEXT_STYLE}
        formatter={formatValue}
        labelFormatter={formatTime}
      />
      <Legend
        labelStyle={SERIES_TEXT_STYLE}
        itemSorter={(item) => seriesIndex(content, item.value)}
      />
      {content.series.map(seriesLine)}
    </LineChart>
  );
}

/**
 * Where the series labelled `label` sits in the list. The legend sorts by
 * it, so it keeps the series' order (and the table's) rather than Recharts'
 * default, alphabetical by label.
 */
function seriesIndex(content: TimeSeriesContent, label: unknown): number {
  return content.series.findIndex((series) => series.label === label);
}

/** One series' line, colored by its place in the list. */
function seriesLine(series: TimeSeries, index: number) {
  return (
    <Line
      key={series.id}
      name={series.label}
      dataKey={valueOf(series.id)}
      stroke={seriesColor(index)}
      strokeWidth={2}
      dot={false}
      // Snapshots arrive several times a second; animating each one makes
      // the lines lag behind the data.
      isAnimationActive={false}
    />
  );
}

/** Reads one series' value from a row; undefined leaves a gap in its line. */
function valueOf(id: string): (row: ChartRow) => number | undefined {
  return (row) => row.values[id];
}

function formatTime(timeSec: unknown): string {
  return `${String(timeSec)} s`;
}

/** Compact from 1,000 up: 0, 500, 1K, 2.5K. */
function formatTick(value: number): string {
  return value >= 1_000 ? `${String(value / 1_000)}K` : String(value);
}
