import type {
  ComponentMetrics,
  LimitUse,
  MetricsRun,
  MetricsSnapshot,
  WorkflowMetrics,
} from "../../domain/metrics/metrics-collector";
import type { Project, Workload } from "../../domain/model/project";
import {
  requestsInProgress,
  unfinishedWork,
} from "../../application/run-analysis/counts";
import {
  limitPeaks,
  type LimitPeak,
  type RateFlow,
} from "../../application/run-analysis/limit-peaks";
import {
  workflowSeconds,
  type WorkflowSecond,
} from "../../application/run-analysis/workflow-seconds";
import { createDetectors } from "../../application/run-analysis/findings/create-detectors";
import { createPhrasebook } from "../../application/run-analysis/findings/create-phrasebook";
import { findRun } from "../../application/run-analysis/findings/find-run";
import { formatFindings, formatVerdict } from "./findings-report";
import { count, seconds, shareDown } from "./text-format";

/** The run to report on, and the project and workload it ran. */
export interface ReportInput {
  readonly project: Project;
  readonly workload: Workload;
  readonly run: MetricsRun;
}

/**
 * Renders a run as plain text for a terminal: the verdict and findings, then
 * totals per workflow and component, failure causes, limits, and one row
 * per snapshot. Deterministic,
 * so tests can compare it to a file snapshot.
 */
export function formatReport(input: ReportInput): string {
  const { project, workload, run } = input;
  const { totals, snapshots } = run;
  const soFar = { project, workloadId: workload.id, snapshots };
  const detectors = createDetectors();
  const findings = findRun(soFar, detectors);
  const phrasebook = createPhrasebook({ project, detectors });
  const sections = [
    heading(input),
    section("Verdict", formatVerdict(findings.verdict, phrasebook)),
    section("Findings", formatFindings(findings, phrasebook)),
    section("Workflows", workflowTable(totals)),
    section("Failures", failureTotals(totals)),
    section("Components", componentTable(project, totals)),
    section("Limits", limitTable(limitPeaks(soFar))),
    section("Workflows per second", workflowTimeline(snapshots)),
    section("Components per second", componentTimeline(project, snapshots)),
  ];
  return sections.join("\n\n") + "\n";
}

function heading({ project, workload, run }: ReportInput): string {
  return [
    `${project.name} (${project.id})`,
    `Workload: ${workload.name} (${workload.id}), ${String(workload.durationMs / 1000)} s, seed ${String(workload.seed)}`,
    `Events processed: ${run.eventsProcessed.toLocaleString("en-US")}`,
  ].join("\n");
}

function section(title: string, body: string): string {
  return `${title}\n${"=".repeat(title.length)}\n${body}`;
}

/** One column of a table: its header and its cell for a row. */
interface Column<Row> {
  readonly header: string;
  readonly cell: (row: Row) => string;
}

/** A table, then a blank line, then the notes that explain it. */
interface NotedTable<Row> {
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly notes: readonly string[];
}

function notedTable<Row>({ columns, rows, notes }: NotedTable<Row>): string {
  const cells = rows.map((row) => columns.map((c) => c.cell(row)));
  return [
    table(
      columns.map((c) => c.header),
      cells,
    ),
    "",
    ...notes,
  ].join("\n");
}

/** One workflow's metrics, for the Workflows table. */
interface WorkflowRow {
  readonly id: string;
  readonly metrics: WorkflowMetrics;
}

const WORKFLOW_COLUMNS: readonly Column<WorkflowRow>[] = [
  { header: "workflow", cell: (r) => r.id },
  { header: "started", cell: (r) => count(r.metrics.started) },
  { header: "ok", cell: (r) => count(r.metrics.succeeded) },
  { header: "failed", cell: (r) => count(r.metrics.failed) },
  { header: "in progress", cell: (r) => count(requestsInProgress(r.metrics)) },
  {
    header: "failed %",
    cell: ({ metrics: w }) => percent(w.failed, w.succeeded + w.failed),
  },
  { header: "p50", cell: (r) => ms(r.metrics.latency?.p50Ms) },
  { header: "p95", cell: (r) => ms(r.metrics.latency?.p95Ms) },
  { header: "p99", cell: (r) => ms(r.metrics.latency?.p99Ms) },
  { header: "max", cell: (r) => ms(r.metrics.latency?.maxMs) },
];

const WORKFLOW_NOTES = [
  'started = ok + failed + in progress. "in progress" requests had no answer yet when the run ended.',
  '"failed %" is of answered requests (ok + failed). Latencies are in ms, of ok requests.',
];

function workflowTable(totals: MetricsSnapshot): string {
  const rows = Object.entries(totals.workflows).map(([id, metrics]) => ({
    id,
    metrics,
  }));
  return notedTable({ columns: WORKFLOW_COLUMNS, rows, notes: WORKFLOW_NOTES });
}

/** How many of a workflow's requests failed for one cause. */
interface FailureRow {
  readonly workflowId: string;
  readonly cause: string;
  readonly failedRequests: number;
}

const FAILURE_COLUMNS: readonly Column<FailureRow>[] = [
  { header: "workflow", cell: (r) => r.workflowId },
  { header: "cause", cell: (r) => r.cause },
  { header: "failed requests", cell: (r) => count(r.failedRequests) },
];

const FAILURE_NOTES = [
  `Each workflow's rows add up to its "failed" count above. The cause is the component and reason where the failure started; the callers it passed through count it as "failed" in Components.`,
];

function failureTotals(totals: MetricsSnapshot): string {
  const rows = Object.entries(totals.workflows).flatMap(([workflowId, w]) =>
    Object.entries(w.failures)
      .sort(([, a], [, b]) => b - a)
      .map(([cause, failedRequests]) => ({
        workflowId,
        cause,
        failedRequests,
      })),
  );
  if (rows.length === 0) return "None.";
  return notedTable({ columns: FAILURE_COLUMNS, rows, notes: FAILURE_NOTES });
}

/** One component's metrics, for the Components table. */
interface ComponentRow {
  readonly id: string;
  readonly metrics: ComponentMetrics;
}

const COMPONENT_COLUMNS: readonly Column<ComponentRow>[] = [
  { header: "component", cell: (r) => r.id },
  { header: "arrivals", cell: (r) => count(r.metrics.arrivals) },
  { header: "ok", cell: (r) => count(r.metrics.completed) },
  { header: "failed", cell: (r) => count(r.metrics.failed) },
  { header: "rejected", cell: (r) => count(r.metrics.rejected) },
  { header: "unfinished", cell: (r) => count(unfinishedWork(r.metrics)) },
  { header: "timeouts", cell: (r) => count(r.metrics.timeouts) },
  { header: "p50", cell: (r) => ms(r.metrics.latency?.p50Ms) },
  { header: "p99", cell: (r) => ms(r.metrics.latency?.p99Ms) },
  { header: "peak busy", cell: (r) => count(r.metrics.peakInProgress) },
  { header: "peak queue", cell: (r) => count(r.metrics.peakQueueDepth) },
  { header: "other", cell: (r) => extras(r.metrics) },
];

const COMPONENT_NOTES = [
  'arrivals = ok + failed + rejected + unfinished. "unfinished" work was still running or waiting when the run ended.',
  `"timeouts" isn't part of that sum: the caller stopped waiting, but the component still finished the work as ok or failed.`,
  'Latencies are in ms (bucket upper bounds, up to 5% high), of ok work. "busy" is work running; "queue" is work waiting.',
  'Queues: "ok" counts messages accepted. Each is then delivered (async ok), waiting in the backlog, or being delivered.',
  '"async failed" counts failed deliveries, with their causes in parentheses; those messages go back to the backlog and are tried again.',
];

function componentTable(project: Project, totals: MetricsSnapshot): string {
  const rows = project.architecture.components.map(({ id }) => ({
    id,
    metrics: metricsFor(totals, id),
  }));
  return notedTable({
    columns: COMPONENT_COLUMNS,
    rows,
    notes: COMPONENT_NOTES,
  });
}

/** Async deliveries and type-specific counters, e.g. `coldStarts=12`. */
function extras(m: ComponentMetrics): string {
  const parts: string[] = [];
  if (m.asyncSucceeded + m.asyncFailed > 0) {
    parts.push(`async ok=${count(m.asyncSucceeded)}`);
    parts.push(`async failed=${count(m.asyncFailed)}${byCause(m)}`);
    parts.push(`backlog=${count(m.queueDepth)}`);
    // Accepted messages neither delivered nor waiting.
    const delivering = m.completed - m.asyncSucceeded - m.queueDepth;
    parts.push(`being delivered=${count(delivering)}`);
    if (m.asyncLatency !== undefined) {
      parts.push(`async p99=${ms(m.asyncLatency.p99Ms)}`);
    }
  }
  for (const [name, value] of Object.entries(m.counters)) {
    parts.push(`${name}=${count(value)}`);
  }
  return parts.join(", ");
}

/** Failed deliveries by cause, most first, e.g. ` (orders-db: too-many-connections 3)`. */
function byCause({ asyncFailures }: ComponentMetrics): string {
  const causes = Object.entries(asyncFailures)
    .sort(([, a], [, b]) => b - a)
    .map(([cause, failed]) => `${cause} ${count(failed)}`);
  return causes.length === 0 ? "" : ` (${causes.join("; ")})`;
}

/** The unit of each kind of limit's numbers. */
const LIMIT_UNITS: Readonly<Record<LimitUse["kind"], string>> = {
  concurrency: "slots held",
  rate: "tokens drawn",
};

const LIMIT_COLUMNS: readonly Column<LimitPeak>[] = [
  { header: "component", cell: (r) => r.componentId },
  { header: "limit", cell: (r) => r.name },
  { header: "peak", cell: (r) => count(Math.round(r.peak)) },
  { header: "of", cell: (r) => count(r.limit) },
  { header: "unit", cell: (r) => LIMIT_UNITS[r.kind] },
  { header: "peak %", cell: (r) => shareDown(r.peakShare) },
  { header: "exhausted", cell: (r) => (r.exhausted ? "yes" : "-") },
  { header: "busiest flow", cell: (r) => flow(r.flow) },
];

const LIMIT_NOTES = [
  '"peak" is the most used at once during the run, against the limit in "of": slots held, or tokens drawn out of a full bucket.',
  '"peak %" rounds down. "exhausted" means the limit ran out: every slot held, or less than one token in the bucket, so a request arriving then waited or was rejected (see "peak queue" and "rejected" in Components).',
  `A rate limit's bucket refills at a steady rate. "busiest flow" is the busiest second's tokens taken, against that rate: above it, the bucket drains.`,
];

function limitTable(rows: readonly LimitPeak[]): string {
  if (rows.length === 0) return "None.";
  return notedTable({ columns: LIMIT_COLUMNS, rows, notes: LIMIT_NOTES });
}

const WORKFLOW_SECOND_COLUMNS: readonly Column<WorkflowSecond>[] = [
  { header: "t (s)", cell: (r) => seconds(r.snapshot.endMs) },
  { header: "started", cell: (r) => count(r.started) },
  { header: "ok", cell: (r) => count(r.succeeded) },
  { header: "failed", cell: (r) => count(r.failed) },
  { header: "in progress", cell: (r) => count(r.inProgress) },
];

const WORKFLOW_SECOND_NOTES = [
  'Each row covers the second ending at t. "started" counts requests that arrived in it; "ok" and "failed" count those answered in it, whenever they started.',
  `"in progress" is at the end of the second: the previous row's, plus started, minus ok and failed. The last row matches the Workflows total.`,
];

function workflowTimeline(snapshots: readonly MetricsSnapshot[]): string {
  const ids = Object.keys(snapshots[0]?.workflows ?? {});
  const p99Columns = ids.map((id): Column<WorkflowSecond> => ({
    header: `${id} p99`,
    cell: (r) => ms(r.snapshot.workflows[id]?.latency?.p99Ms),
  }));
  return notedTable({
    columns: [...WORKFLOW_SECOND_COLUMNS, ...p99Columns],
    rows: workflowSeconds(snapshots),
    notes: WORKFLOW_SECOND_NOTES,
  });
}

const TIME_COLUMN: Column<MetricsSnapshot> = {
  header: "t (s)",
  cell: (s) => seconds(s.endMs),
};

/**
 * Each component's limits at their peak (or its peak work in progress, if
 * it has no limits), plus queue depth and gauges for the components that
 * have them.
 */
function componentTimeline(
  project: Project,
  snapshots: readonly MetricsSnapshot[],
): string {
  const columns = project.architecture.components.flatMap(({ id }) =>
    componentColumns(id, snapshots),
  );
  return notedTable({
    columns: [TIME_COLUMN, ...columns],
    rows: snapshots,
    notes: [
      "Each column is a peak during the second: a component's use of each of its limits (slots held, or tokens drawn out of a full bucket; see Limits), or, for a component without limits, its busy work; then its queue. Gauges are values at the second's end.",
    ],
  });
}

/**
 * One component's columns: its limits (or busy, if it has none), queue if it
 * ever had one, then gauges.
 */
function componentColumns(
  id: string,
  snapshots: readonly MetricsSnapshot[],
): Column<MetricsSnapshot>[] {
  const busy: Column<MetricsSnapshot> = {
    header: `${id} busy`,
    cell: (s) => count(metricsFor(s, id).peakInProgress),
  };
  const queue: Column<MetricsSnapshot> = {
    header: `${id} queue`,
    cell: (s) => count(metricsFor(s, id).peakQueueDepth),
  };
  const hasQueue = snapshots.some((s) => metricsFor(s, id).peakQueueDepth > 0);
  const gauges = Object.keys(snapshots[0]?.components[id]?.gauges ?? {}).map(
    (gauge): Column<MetricsSnapshot> => ({
      header: `${id} ${gauge}`,
      cell: (s) => count(metricsFor(s, id).gauges[gauge] ?? 0),
    }),
  );
  const limits = limitColumns(id, snapshots);
  const work = limits.length > 0 ? limits : [busy];
  return [...work, ...(hasQueue ? [queue] : []), ...gauges];
}

/** A column per limit of the component: its peak use in each second. */
function limitColumns(
  id: string,
  snapshots: readonly MetricsSnapshot[],
): Column<MetricsSnapshot>[] {
  const names = (snapshots[0]?.components[id]?.limits ?? []).map((l) => l.name);
  return names.map((name) => ({
    header: `${id} ${name}`,
    cell: (s) => count(Math.round(limitFor(metricsFor(s, id), name).peak)),
  }));
}

function limitFor(metrics: ComponentMetrics, name: string): LimitUse {
  const limit = metrics.limits.find((l) => l.name === name);
  if (limit === undefined) throw new Error(`No limit named ${name}`);
  return limit;
}

function metricsFor(snapshot: MetricsSnapshot, id: string): ComponentMetrics {
  const metrics = snapshot.components[id];
  if (metrics === undefined) throw new Error(`No metrics for ${id}`);
  return metrics;
}

/** Right-aligns columns that hold only numbers (or "-"); left-aligns the rest. */
function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const numeric = headers.map((_, i) =>
    rows.every((r) => /^(-|[\d,.]+%?)$/.test(r[i] ?? "")),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, i) =>
        numeric[i] === true
          ? cell.padStart(widths[i] ?? 0)
          : cell.padEnd(widths[i] ?? 0),
      )
      .join("  ")
      .trimEnd();
  const rule = widths.map((w) => "-".repeat(w)).join("  ");
  return [line(headers), rule, ...rows.map(line)].join("\n");
}

function ms(value: number | undefined): string {
  return value === undefined ? "-" : count(Math.round(value));
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "-" : `${((100 * part) / whole).toFixed(1)}%`;
}

function flow(rate: RateFlow | undefined): string {
  if (rate === undefined) return "-";
  const taken = count(Math.round(rate.busiestTakenPerSec));
  return `${taken} of ${count(rate.ratePerSec)} per s`;
}
