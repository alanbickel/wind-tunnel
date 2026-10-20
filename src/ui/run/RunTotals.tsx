import { useId, useMemo, type ReactNode } from "react";
import { Explained } from "../shared/Explained";
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
  type RateFlow,
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

/** Said after a limit's name, so the reader knows what it counts. */
const LIMIT_UNITS: Readonly<Record<LimitUse["kind"], string>> = {
  concurrency: "",
  rate: ", tokens drawn",
};

const LIMIT_COLUMNS: readonly CountsColumn<LimitRow>[] = [
  { header: "Peak", value: (r) => Math.round(r.peak) },
  { header: "Limit", value: (r) => r.limit },
  { header: "Peak %", value: (r) => percentDown(r.peakShare) },
  { header: "Exhausted", value: (r) => (r.exhausted ? "Yes" : "–") },
  { header: "Busiest flow", value: (r) => flow(r.flow) },
];

function limitRow(peak: LimitPeak): LimitRow {
  const unit = LIMIT_UNITS[peak.kind];
  return { ...peak, label: `${peak.componentLabel} ${peak.name}${unit}` };
}

function flow(rate: RateFlow | undefined): string {
  if (rate === undefined) return "–";
  const taken = Math.round(rate.busiestTakenPerSec).toLocaleString("en-US");
  return `${taken} of ${rate.ratePerSec.toLocaleString("en-US")} per s`;
}

/**
 * Rounded down, so 100% only shows when all of it was used. The slack keeps
 * float error (0.29 × 100 = 28.999…) from rounding an exact share down.
 */
function percentDown(share: number | undefined): string {
  if (share === undefined) return "–";
  return `${String(Math.floor(100 * share + 1e-9))}%`;
}

export interface RunTotalsProps {
  readonly run: RunSoFar;
}

/**
 * The run's totals so far, per workflow and per component, and each
 * limit's busiest use. The totals show the work still in progress, so the
 * numbers reconcile at any moment of the run; each says how its columns
 * add up, and an info control by each heading says what the columns mean.
 */
export function RunTotals({ run }: RunTotalsProps) {
  return (
    <div className={styles.totals}>
      <WorkflowWork run={run} />
      <ComponentWork run={run} />
      <LimitTotals run={run} />
    </div>
  );
}

interface TotalsHeadingProps {
  readonly id: string;
  readonly heading: string;
  /** Names the info control: "About <subject>". */
  readonly subject: string;
  /** What the table's columns mean, shown by the info control. */
  readonly children: ReactNode;
}

/** A table's heading, which names the table, and its info control. */
function TotalsHeading({ id, heading, subject, children }: TotalsHeadingProps) {
  return (
    <Explained title={<h4 id={id}>{heading}</h4>} subject={subject}>
      {children}
    </Explained>
  );
}

/** Each workflow's requests so far, with their sum and how it adds up. */
function WorkflowWork({ run }: RunTotalsProps) {
  const headingId = useId();
  const workflows = useMemo(() => workflowTotals(run), [run]);
  return (
    <div>
      <TotalsHeading
        id={headingId}
        heading="Requests (run totals)"
        subject="Requests"
      >
        <p>
          Every request each workflow has started since the run began, and how
          it ended. A request in progress hasn&apos;t been answered yet.
        </p>
      </TotalsHeading>
      <CountsTable
        labelledBy={headingId}
        labelHeader="Workflow"
        columns={WORKFLOW_COLUMNS}
        rows={workflows}
        footer={allWorkflows(workflows)}
      />
      <p className={styles.sum}>Started = succeeded + failed + in progress.</p>
    </div>
  );
}

/** Each component's work so far, and how its columns add up. */
function ComponentWork({ run }: RunTotalsProps) {
  const headingId = useId();
  const components = useMemo(() => componentTotals(run), [run]);
  return (
    <div>
      <TotalsHeading
        id={headingId}
        heading="Components (run totals)"
        subject="Components"
      >
        <p>
          The work each component has taken on since the run began. Unfinished
          work is still running or waiting. For a queue, succeeded counts
          messages accepted, whether or not they&apos;ve been delivered yet.
        </p>
      </TotalsHeading>
      <CountsTable
        labelledBy={headingId}
        labelHeader="Component"
        columns={COMPONENT_COLUMNS}
        rows={components}
      />
      <p className={styles.sum}>
        Arrivals = succeeded + failed + rejected + unfinished.
      </p>
    </div>
  );
}

/**
 * Each limit's busiest use so far, against the limit. Left out until a
 * snapshot reports a limit.
 */
function LimitTotals({ run }: RunTotalsProps) {
  const headingId = useId();
  const limits = useMemo(() => limitPeaks(run).map(limitRow), [run]);
  if (limits.length === 0) return null;
  return (
    <div>
      <TotalsHeading
        id={headingId}
        heading="Limits (run peaks)"
        subject="Limits"
      >
        <LimitsExplanation />
      </TotalsHeading>
      <CountsTable
        labelledBy={headingId}
        labelHeader="Limit"
        columns={LIMIT_COLUMNS}
        rows={limits}
      />
    </div>
  );
}

/** What the limits table's columns mean. */
function LimitsExplanation() {
  return (
    <>
      <p>
        Each limit&apos;s busiest use since the run began. Peak is the most used
        at once: slots held, such as connections, or tokens drawn out of a full
        bucket. Peak % rounds down.
      </p>
      <p>
        Exhausted means the limit ran out: every slot held, or less than one
        token in the bucket, so a request arriving then waited or was rejected.
        A bucket refills at a steady rate; busiest flow is the busiest
        second&apos;s requests against that rate. Above it, the bucket drains.
      </p>
    </>
  );
}
