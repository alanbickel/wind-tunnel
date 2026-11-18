import { lazy, Suspense, useId, useMemo } from "react";
import { LoadFailureBoundary } from "../shared/load-failure-boundary";
import { chartRows, type ChartRow } from "./chart-rows";
import { formatValue } from "./format-value";
import { plotStyle } from "./plot-style";
import type { ChartSize, TimeSeries, TimeSeriesContent } from "./time-series";

// Recharts arrives in its own chunk the first time a chart draws, so the
// app loads without it (#16).
const ChartPlot = lazy(() =>
  import("./ChartPlot").then((module) => ({ default: module.ChartPlot })),
);

export interface TimeSeriesChartProps {
  readonly content: TimeSeriesContent;
  /** How tall the plot is; "full" if not given. */
  readonly size?: ChartSize;
}

/**
 * Lines over simulated time, one per series, with a legend and a tooltip
 * (ADR-0011). The same numbers follow as a table, for screen readers and
 * for the lighter line colors. The title and table show at once; the lines
 * follow when Recharts has loaded, and if it can't, the table still holds
 * the numbers.
 */
export function TimeSeriesChart({
  content,
  size = "full",
}: TimeSeriesChartProps) {
  const headingId = useId();
  const rows = useMemo(() => chartRows(content.series), [content.series]);
  const standIn = standInStyle(size);

  return (
    <figure aria-labelledby={headingId}>
      <h4 id={headingId}>{content.title}</h4>
      <LoadFailureBoundary
        failure={
          <div style={standIn}>
            Couldn't load the chart. Reload the page to try again.
          </div>
        }
      >
        <Suspense fallback={<div style={standIn}>Loading the chart…</div>}>
          <ChartPlot content={content} rows={rows} size={size} />
        </Suspense>
      </LoadFailureBoundary>
      <ChartTable content={content} rows={rows} />
    </figure>
  );
}

/** Holds the plot's place while Recharts loads, or if it can't. */
function standInStyle(size: ChartSize) {
  return { ...plotStyle(size), color: "var(--color-text-muted)" } as const;
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
