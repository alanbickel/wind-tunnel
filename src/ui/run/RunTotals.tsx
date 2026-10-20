import { useMemo } from "react";
import { CountsTable, type CountsColumn } from "./CountsTable";
import type { RunSoFar } from "../../application/run-analysis/run-so-far";
import {
  allWorkflows,
  componentTotals,
  workflowTotals,
  type ComponentTotals,
  type WorkflowTotals,
} from "../../application/run-analysis/run-totals";
import {
  limitPeaks,
  type LimitPeak,
} from "../../application/run-analysis/limit-peaks";
import type { LimitUse } from "../../domain/metrics/metrics-snapshot";
import styles from "./RunTotals.module.css";

const WORKFLOW_COLUMNS: readonly CountsColumn<WorkflowTotals>[] = [
  { header: "Started", value: (r) => r.started },
  { header: "Succeeded", value: (r) => r.succeeded },
  { header: "Failed", value: (r) => r.failed },
  { header: "In progress", value: (r) => r.inProgress },
];

const COMPONENT_COLUMNS: readonly CountsColumn<ComponentTotals>[] = [
  { header: "Arrivals", value: (r) => r.arrivals },
  { header: "Succeeded", value: (r) => r.completed },
  { header: "Failed", value: (r) => r.failed },
  { header: "Rejected", value: (r) => r.rejected },
  { header: "Unfinished", value: (r) => r.unfinished },
];

/** A limit's peak, labeled with its component and unit. */
interface LimitRow extends LimitPeak {
  readonly label: string;
}

/** Said after a limit's name, so the reader knows its unit. */
const LIMIT_UNITS: Readonly<Record<LimitUse["kind"], string>> = {
  concurrency: "",
  rate: " per second",
};

const LIMIT_COLUMNS: readonly CountsColumn<LimitRow>[] = [
  { header: "Peak", value: (r) => Math.round(r.peak) },
  { header: "Limit", value: (r) => r.limit },
  { header: "Peak %", value: (r) => percent(r.peakShare) },
];

function limitRow(peak: LimitPeak): LimitRow {
  const unit = LIMIT_UNITS[peak.kind];
  return { ...peak, label: `${peak.componentLabel} ${peak.name}${unit}` };
}

function percent(share: number | undefined): string {
  return share === undefined ? "–" : `${String(Math.round(100 * share))}%`;
}

export interface RunTotalsProps {
  readonly run: RunSoFar;
}

/**
 * The run's totals so far, per workflow and per component. Each table says
 * how its columns add up, and shows the work still in progress, so the
 * numbers reconcile at any moment of the run.
 */
export function RunTotals({ run }: RunTotalsProps) {
  const workflows = useMemo(() => workflowTotals(run), [run]);

  return (
    <div className={styles.totals}>
      <CountsTable
        caption="Requests so far"
        labelHeader="Workflow"
        columns={WORKFLOW_COLUMNS}
        rows={workflows}
        footer={allWorkflows(workflows)}
      />
      <p className={styles.note}>
        Started = succeeded + failed + in progress. A request in progress
        hasn&apos;t been answered yet.
      </p>
      <ComponentWork run={run} />
      <LimitTotals run={run} />
    </div>
  );
}

/** Each component's work so far, and how its columns add up. */
function ComponentWork({ run }: RunTotalsProps) {
  const components = useMemo(() => componentTotals(run), [run]);
  return (
    <>
      <CountsTable
        caption="Work per component so far"
        labelHeader="Component"
        columns={COMPONENT_COLUMNS}
        rows={components}
      />
      <p className={styles.note}>
        Arrivals = succeeded + failed + rejected + unfinished. Unfinished work
        is still running or waiting. For a queue, succeeded counts messages
        accepted, whether or not they&apos;ve been delivered yet.
      </p>
    </>
  );
}

/**
 * Each limit's busiest use so far, against the limit. Left out until a
 * snapshot reports a limit.
 */
function LimitTotals({ run }: RunTotalsProps) {
  const limits = useMemo(() => limitPeaks(run).map(limitRow), [run]);
  if (limits.length === 0) return null;
  return (
    <>
      <CountsTable
        caption="Busiest use of each limit so far"
        labelHeader="Limit"
        columns={LIMIT_COLUMNS}
        rows={limits}
      />
      <p className={styles.note}>
        Peak is the most used in any one second: slots held at once, such as
        connections, or requests per second for a rate. At 100%, a limit on
        slots was full, and the next request waited or was rejected. A rate can
        pass 100% for a while by spending capacity saved up while quiet.
      </p>
    </>
  );
}
