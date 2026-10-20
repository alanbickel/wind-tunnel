import { lazy, Suspense, useId, useMemo } from "react";
import { chartRows, type ChartRow } from "./chart-rows";
import { formatValue } from "./format-value";
import { PLOT_STYLE } from "./plot-style";
import type { TimeSeries, TimeSeriesContent } from "./time-series";

// Recharts arrives in its own chunk the first time a chart draws, so the
// app loads without it (#16).
const ChartPlot = lazy(() =>
  import("./ChartPlot").then((module) => ({ default: module.ChartPlot })),
);

// Holds the plot's place while Recharts loads.
const STAND_IN_STYLE = {
  ...PLOT_STYLE,
  color: "var(--color-text-muted)",
} as const;

export interface TimeSeriesChartProps {
  readonly content: TimeSeriesContent;
}

/**
 * Lines over simulated time, one per series, with a legend and a tooltip
 * (ADR-0011). The same numbers follow as a table, for screen readers and
 * for the lighter line colors. The title and table show at once; the lines
 * follow when Recharts has loaded.
 */
export function TimeSeriesChart({ content }: TimeSeriesChartProps) {
  const headingId = useId();
  const rows = useMemo(() => chartRows(content.series), [content.series]);

  return (
    <figure aria-labelledby={headingId}>
      <h4 id={headingId}>{content.title}</h4>
      <Suspense fallback={<div style={STAND_IN_STYLE}>Loading the chart…</div>}>
        <ChartPlot content={content} rows={rows} />
      </Suspense>
      <ChartTable content={content} rows={rows} />
    </figure>
  );
}

interface ChartTableProps {
  readonly content: TimeSeriesContent;
  readonly rows: readonly ChartRow[];
}

/** The chart's numbers, one row per time, behind a disclosure. */
function ChartTable({ content, rows }: ChartTableProps) {
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

function cellOf(row: ChartRow, series: TimeSeries): string {
  const value = row.values[series.id];
  return value === undefined ? "–" : formatValue(value);
}
