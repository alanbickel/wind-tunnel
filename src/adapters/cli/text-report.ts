import type { LatencySummary } from "../../domain/metrics/latency-histogram";
import type {
  ComponentMetrics,
  MetricsRun,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import type { Project, Workload } from "../../domain/model/project";

/**
 * Renders a run's metrics as plain text for a terminal: totals per workflow
 * and component, failure causes, then one row per snapshot. Deterministic,
 * so tests can compare it to a file snapshot.
 */
export function formatReport(
  project: Project,
  workload: Workload,
  run: MetricsRun,
): string {
  const { totals, snapshots } = run;
  const sections = [
    [
      `${project.name} (${project.id})`,
      `Workload: ${workload.name} (${workload.id}), ${String(workload.durationSec)} s, seed ${String(workload.seed)}`,
      `Events processed: ${run.eventsProcessed.toLocaleString("en-US")}`,
    ].join("\n"),
    section("Workflows", workflowTotals(totals)),
    section("Failures", failureTotals(totals)),
    section("Components", componentTotals(project, totals)),
    section("Workflows per second", workflowTimeline(snapshots)),
    section("Components per second", componentTimeline(project, snapshots)),
  ];
  return sections.join("\n\n") + "\n";
}

function section(title: string, body: string): string {
  return `${title}\n${"=".repeat(title.length)}\n${body}`;
}

function workflowTotals(totals: MetricsSnapshot): string {
  const rows = Object.entries(totals.workflows).map(([id, w]) => [
    id,
    count(w.started),
    count(w.succeeded),
    count(w.failed),
    count(w.started - w.succeeded - w.failed),
    percent(w.failed, w.succeeded + w.failed),
    ...latencyCells(w.latency),
  ]);
  return [
    table(
      [
        "workflow",
        "started",
        "ok",
        "failed",
        "in progress",
        "failed %",
        "p50",
        "p95",
        "p99",
        "max",
      ],
      rows,
    ),
    "",
    'started = ok + failed + in progress. "in progress" requests had no answer yet when the run ended.',
    '"failed %" is of answered requests (ok + failed). Latencies are in ms, of ok requests.',
  ].join("\n");
}

function failureTotals(totals: MetricsSnapshot): string {
  const rows = Object.entries(totals.workflows).flatMap(([id, w]) =>
    Object.entries(w.failures)
      .sort(([, a], [, b]) => b - a)
      .map(([cause, n]) => [id, cause, count(n)]),
  );
  if (rows.length === 0) return "None.";
  return [
    table(["workflow", "cause", "failed requests"], rows),
    "",
    `Each workflow's rows add up to its "failed" count above. The cause is the component and reason where the failure started; the callers it passed through count it as "failed" in Components.`,
  ].join("\n");
}

function componentTotals(project: Project, totals: MetricsSnapshot): string {
  const rows = project.architecture.components.map((c) => {
    const m = metricsFor(totals, c.id);
    return [
      c.id,
      count(m.arrivals),
      count(m.completed),
      count(m.failed),
      count(m.rejected),
      count(unfinished(m)),
      count(m.timeouts),
      ms(m.latency?.p50),
      ms(m.latency?.p99),
      count(m.peakInProgress),
      count(m.peakQueueDepth),
      extras(m),
    ];
  });
  return [
    table(
      [
        "component",
        "arrivals",
        "ok",
        "failed",
        "rejected",
        "unfinished",
        "timeouts",
        "p50",
        "p99",
        "peak busy",
        "peak queue",
        "other",
      ],
      rows,
    ),
    "",
    'arrivals = ok + failed + rejected + unfinished. "unfinished" work was still running or waiting when the run ended.',
    `"timeouts" isn't part of that sum: the caller stopped waiting, but the component still finished the work as ok or failed.`,
    'Latencies are in ms (bucket upper bounds, up to 5% high), of ok work. "busy" is work running; "queue" is work waiting.',
    'Queues: "ok" counts messages accepted. Each is then delivered (async ok), waiting in the backlog, or being delivered.',
    '"async failed" counts failed deliveries; those messages go back to the backlog and are tried again.',
  ].join("\n");
}

/** Work that arrived and hadn't finished or been rejected by the end. */
function unfinished(m: ComponentMetrics): number {
  return m.arrivals - m.completed - m.failed - m.rejected;
}

/** Async deliveries and type-specific counters, e.g. `coldStarts=12`. */
function extras(m: ComponentMetrics): string {
  const parts: string[] = [];
  if (m.asyncSucceeded + m.asyncFailed > 0) {
    parts.push(`async ok=${count(m.asyncSucceeded)}`);
    parts.push(`async failed=${count(m.asyncFailed)}`);
    parts.push(`backlog=${count(m.queueDepth)}`);
    // Accepted messages neither delivered nor waiting.
    const delivering = m.completed - m.asyncSucceeded - m.queueDepth;
    parts.push(`being delivered=${count(delivering)}`);
    if (m.asyncLatency !== undefined) {
      parts.push(`async p99=${ms(m.asyncLatency.p99)}`);
    }
  }
  for (const [name, value] of Object.entries(m.counters)) {
    parts.push(`${name}=${count(value)}`);
  }
  return parts.join(", ");
}

function workflowTimeline(snapshots: readonly MetricsSnapshot[]): string {
  const ids = Object.keys(snapshots[0]?.workflows ?? {});
  let inProgress = 0;
  const rows = snapshots.map((s) => {
    const all = Object.values(s.workflows);
    const started = sum(all.map((w) => w.started));
    const succeeded = sum(all.map((w) => w.succeeded));
    const failed = sum(all.map((w) => w.failed));
    inProgress += started - succeeded - failed;
    return [
      seconds(s.endMs),
      count(started),
      count(succeeded),
      count(failed),
      count(inProgress),
      ...ids.map((id) => ms(s.workflows[id]?.latency?.p99)),
    ];
  });
  return [
    table(
      [
        "t (s)",
        "started",
        "ok",
        "failed",
        "in progress",
        ...ids.map((id) => `${id} p99`),
      ],
      rows,
    ),
    "",
    'Each row covers the second ending at t. "started" counts requests that arrived in it; "ok" and "failed" count those answered in it, whenever they started.',
    `"in progress" is at the end of the second: the previous row's, plus started, minus ok and failed. The last row matches the Workflows total.`,
  ].join("\n");
}

/** One column of a per-second table: its header and its cell for a snapshot. */
interface TimelineColumn {
  readonly header: string;
  readonly value: (snapshot: MetricsSnapshot) => string;
}

/**
 * Peak work in progress for every component, plus queue depth and gauges
 * (e.g. RDS `connectionsHeld`) for the components that have them.
 */
function componentTimeline(
  project: Project,
  snapshots: readonly MetricsSnapshot[],
): string {
  const columns: TimelineColumn[] = [];
  for (const { id } of project.architecture.components) {
    columns.push({
      header: `${id} busy`,
      value: (s) => count(metricsFor(s, id).peakInProgress),
    });
    if (snapshots.some((s) => metricsFor(s, id).peakQueueDepth > 0)) {
      columns.push({
        header: `${id} queue`,
        value: (s) => count(metricsFor(s, id).peakQueueDepth),
      });
    }
    const gauges = Object.keys(snapshots[0]?.components[id]?.gauges ?? {});
    for (const gauge of gauges) {
      columns.push({
        header: `${id} ${gauge}`,
        value: (s) => count(metricsFor(s, id).gauges[gauge] ?? 0),
      });
    }
  }
  const rows = snapshots.map((s) => [
    seconds(s.endMs),
    ...columns.map((c) => c.value(s)),
  ]);
  return [
    table(["t (s)", ...columns.map((c) => c.header)], rows),
    "",
    "busy and queue are peaks during the second; gauges are values at its end.",
  ].join("\n");
}

function metricsFor(snapshot: MetricsSnapshot, id: string): ComponentMetrics {
  const metrics = snapshot.components[id];
  if (metrics === undefined) throw new Error(`No metrics for ${id}`);
  return metrics;
}

function latencyCells(latency: LatencySummary | undefined): string[] {
  return [latency?.p50, latency?.p95, latency?.p99, latency?.max].map(ms);
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

function count(n: number): string {
  return n.toLocaleString("en-US");
}

function ms(value: number | undefined): string {
  return value === undefined ? "-" : count(Math.round(value));
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "-" : `${((100 * part) / whole).toFixed(1)}%`;
}

function seconds(timeMs: number): string {
  return String(Math.round(timeMs / 100) / 10);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
