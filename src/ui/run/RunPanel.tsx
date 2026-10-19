import { memo, useDeferredValue, useMemo, useState } from "react";
import type { MetricsSnapshot } from "../../domain/metrics/metrics-snapshot";
import type { Project, Workload } from "../../domain/model/project";
import { TimeSeriesChart } from "../charts/TimeSeriesChart";
import { Panel } from "../shared/Panel";
import { handleStatus, type StatusHandlers } from "../shared/status-handlers";
import { runCharts } from "./run-charts";
import { RunControls } from "./RunControls";
import styles from "./RunPanel.module.css";
import { RunTotals } from "./RunTotals";
import {
  useSimulationRun,
  type RunPhase,
  type SimulationRun,
} from "./useSimulationRun";
import { secondsOf } from "./workflow-seconds";

export interface RunPanelProps {
  readonly project: Project;
}

/** Runs one of the project's workloads and shows its metrics as they arrive. */
export function RunPanel({ project }: RunPanelProps) {
  const run = useSimulationRun(project);

  return (
    <Panel heading="Run">
      <WorkloadControls workloads={project.workloads} run={run} />
      {/* Mounted from the start, so screen readers announce each change. */}
      <p role="status" className={styles.status}>
        {statusText(run.phase, simulatedSec(run.snapshots))}
      </p>
      {run.phase.status !== "idle" && (
        <RunResults
          project={project}
          workload={run.phase.workload}
          snapshots={run.snapshots}
        />
      )}
    </Panel>
  );
}

interface WorkloadControlsProps {
  readonly workloads: readonly Workload[];
  readonly run: SimulationRun;
}

/** The run controls, starting on the first workload; none if there are none. */
function WorkloadControls({ workloads, run }: WorkloadControlsProps) {
  const [workload, setWorkload] = useState(workloads[0]);
  if (workload === undefined) {
    return <p>This project has no workloads to run.</p>;
  }
  return (
    <RunControls
      workloads={workloads}
      workload={workload}
      onPick={setWorkload}
      running={run.phase.status === "running"}
      onStart={() => {
        run.start(workload);
      }}
      onStop={run.stop}
    />
  );
}

/** The run's state in words; empty before the first run. */
function statusText(phase: RunPhase, seconds: number): string {
  return handleStatus(statusTexts(seconds), phase);
}

/** Each phase's message, given the simulated seconds received. */
function statusTexts(seconds: number): StatusHandlers<RunPhase, string> {
  return {
    idle: () => "",
    running: ({ workload }) => `Running ${workload.name}…`,
    finished: ({ workload }) => `Finished ${workload.name}.`,
    stopped: ({ workload }) =>
      `Stopped ${workload.name} after ${String(seconds)} of ${String(durationSec(workload))} simulated seconds.`,
    failed: ({ workload, problem }) => `${workload.name} failed: ${problem}`,
  };
}

/** Measured like `simulatedSec`, so a finished run fills the bar. */
function durationSec(workload: Workload): number {
  return secondsOf(workload.durationMs);
}

/** Simulated time the snapshots cover, from the end of the last one. */
function simulatedSec(snapshots: readonly MetricsSnapshot[]): number {
  return secondsOf(snapshots.at(-1)?.endMs ?? 0);
}

interface RunResultsProps {
  readonly project: Project;
  readonly workload: Workload;
  readonly snapshots: readonly MetricsSnapshot[];
}

/** How far the run got, its totals, and its charts. */
function RunResults({ project, workload, snapshots }: RunResultsProps) {
  // Charts take far longer to draw than a snapshot takes to arrive. Drawing
  // them from a deferred copy lets React put clicks (such as Stop) first and
  // skip snapshots it falls behind on; the progress bar stays current.
  const deferredSnapshots = useDeferredValue(snapshots);
  const totalSec = durationSec(workload);
  const doneSec = simulatedSec(snapshots);

  return (
    <div className={styles.results}>
      <p className={styles.progress}>
        <progress value={doneSec} max={totalSec} aria-label="Simulated time" />
        {doneSec} of {totalSec} simulated seconds
      </p>
      <RunMetrics project={project} snapshots={deferredSnapshots} />
    </div>
  );
}

interface RunMetricsProps {
  readonly project: Project;
  readonly snapshots: readonly MetricsSnapshot[];
}

/**
 * The totals and charts. Memoized, so it draws again only when the deferred
 * snapshots change, not on every snapshot that `RunResults` sees.
 */
const RunMetrics = memo(function RunMetrics({
  project,
  snapshots,
}: RunMetricsProps) {
  const run = useMemo(() => ({ project, snapshots }), [project, snapshots]);
  const charts = useMemo(() => runCharts(run), [run]);

  return (
    <>
      <RunTotals run={run} />
      {charts.map((content) => (
        <TimeSeriesChart key={content.title} content={content} />
      ))}
    </>
  );
});
