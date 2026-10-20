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
  const components = useMemo(() => componentTotals(run), [run]);

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
    </div>
  );
}
