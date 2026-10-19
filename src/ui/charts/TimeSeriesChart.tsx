import { useId, useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartRows, type ChartRow } from "./chart-rows";
import { seriesColor } from "./series-colors";
import type { TimeSeries, TimeSeriesContent } from "./time-series";

// Recessive chrome, so the lines are the loudest thing on the chart. Token
// references resolve in the browser, so they follow the theme (ADR-0012).
const GRID_COLOR = "var(--color-divider)";
const AXIS_COLOR = "#898781";
// Recharts draws the tooltip on white by default.
const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
} as const;
const CHART_STYLE = { width: "100%", height: 260 } as const;

export interface TimeSeriesChartProps {
  readonly content: TimeSeriesContent;
}

/**
 * Lines over simulated time, one per series, with a legend and a tooltip
 * (ADR-0011). The same numbers follow as a table, for screen readers and
 * for the lighter line colors.
 */
export function TimeSeriesChart({ content }: TimeSeriesChartProps) {
  const headingId = useId();
  const rows = useMemo(() => chartRows(content.series), [content.series]);

  return (
    <figure aria-labelledby={headingId}>
      <h4 id={headingId}>{content.title}</h4>
      <ChartPlot content={content} rows={rows} />
      <ChartTable content={content} rows={rows} />
    </figure>
  );
}

interface ChartPartProps {
  readonly content: TimeSeriesContent;
  readonly rows: readonly ChartRow[];
}

/** The lines themselves, drawn by Recharts. */
function ChartPlot({ content, rows }: ChartPartProps) {
  return (
    <LineChart responsive style={CHART_STYLE} data={rows}>
      <CartesianGrid stroke={GRID_COLOR} vertical={false} />
      <XAxis
        dataKey="timeSec"
        type="number"
        domain={["dataMin", "dataMax"]}
        allowDecimals={false}
        unit=" s"
        stroke={AXIS_COLOR}
      />
      <YAxis
        stroke={AXIS_COLOR}
        tickFormatter={formatTick}
        label={{ value: content.unit, angle: -90, position: "insideLeft" }}
      />
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        formatter={formatValue}
        labelFormatter={formatTime}
      />
      <Legend itemSorter={(item) => seriesIndex(content, item.value)} />
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

/** The chart's numbers, one row per time, behind a disclosure. */
function ChartTable({ content, rows }: ChartPartProps) {
  return (
    <details>
      <summary>{content.title} as a table</summary>
      <table>
        <caption>
          {content.title} ({content.unit})
        </caption>
        <thead>
          <ChartTableHeader series={content.series} />
        </thead>
        <tbody>
          {rows.map((row) => (
            <ChartTableRow
              key={row.timeSec}
              row={row}
              series={content.series}
            />
          ))}
        </tbody>
      </table>
    </details>
  );
}

interface ChartTableHeaderProps {
  readonly series: readonly TimeSeries[];
}

function ChartTableHeader({ series }: ChartTableHeaderProps) {
  return (
    <tr>
      <th scope="col">Time (s)</th>
      {series.map((s) => (
        <th key={s.id} scope="col">
          {s.label}
        </th>
      ))}
    </tr>
  );
}

interface ChartTableRowProps {
  readonly row: ChartRow;
  readonly series: readonly TimeSeries[];
}

function ChartTableRow({ row, series }: ChartTableRowProps) {
  return (
    <tr>
      <th scope="row">{formatValue(row.timeSec)}</th>
      {series.map((s) => (
        <td key={s.id}>{cellOf(row, s)}</td>
      ))}
    </tr>
  );
}

/** Reads one series' value from a row; undefined leaves a gap in its line. */
function valueOf(id: string): (row: ChartRow) => number | undefined {
  return (row) => row.values[id];
}

function cellOf(row: ChartRow, series: TimeSeries): string {
  const value = row.values[series.id];
  return value === undefined ? "–" : formatValue(value);
}

function formatValue(value: unknown): string {
  return typeof value === "number"
    ? Math.round(value).toLocaleString("en-US")
    : String(value);
}

function formatTime(timeSec: unknown): string {
  return `${String(timeSec)} s`;
}

/** Compact from 1,000 up: 0, 500, 1K, 2.5K. */
function formatTick(value: number): string {
  return value >= 1_000 ? `${String(value / 1_000)}K` : String(value);
}
