import { memo, useMemo, useState } from "react";
import type { Verdict } from "../../application/run-analysis/findings/verdict";
import type { MetricsSnapshot } from "../../domain/metrics/metrics-snapshot";
import type { Project, Workload } from "../../domain/model/project";
import { TimeSeriesChart } from "../charts/TimeSeriesChart";
import { Panel } from "../shared/Panel";
import { handleStatus, type StatusHandlers } from "../shared/status-handlers";
import { Findings } from "./Findings";
import { runCharts, secondsOf } from "./run-charts";
import { RunControls } from "./RunControls";
import styles from "./RunPanel.module.css";
import { RunTotals } from "./RunTotals";
import { useRunFindings, type RunMeaning } from "./useRunFindings";
import {
  useSimulationRun,
  type RunPhase,
  type SimulationRun,
} from "./useSimulationRun";

export interface RunPanelProps {
  readonly project: Project;
}

/**
 * Runs one of the project's workloads and shows what it means, and its
 * metrics, as they arrive.
 */
export function RunPanel({ project }: RunPanelProps) {
  const run = useSimulationRun(project);
  const workload = workloadOf(run.phase);
  const meaning = useRunFindings({
    project,
    workload,
    snapshots: run.snapshots,
  });
  const status = statusText({
    phase: run.phase,
    seconds: simulatedSec(run.snapshots),
    verdict: meaning?.findings.verdict,
  });

  return (
    <Panel heading="Run" scrolls>
      <WorkloadControls workloads={project.workloads} run={run} />
      {/* Mounted from the start, so screen readers announce each change. */}
      <p role="status" className={styles.status}>
        {status}
      </p>
      {workload !== undefined && meaning !== undefined && (
        <RunResults
          workload={workload}
          snapshots={run.snapshots}
          meaning={meaning}
        />
      )}
    </Panel>
  );
}

/** The workload the latest run ran, if there has been one. */
function workloadOf(phase: RunPhase): Workload | undefined {
  return "workload" in phase ? phase.workload : undefined;
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

/** What the status line says about the latest run. */
interface StatusTextInput {
  readonly phase: RunPhase;
  /** Simulated seconds received. */
  readonly seconds: number;
  /** What the run means so far, if it has started. */
  readonly verdict: Verdict | undefined;
}

/**
 * The run's state in words, with its verdict's title; empty before the
 * first run. The title changes only when the level does, or the run ends,
 * so a screen reader hears it then, not on every snapshot.
 */
function statusText(input: StatusTextInput): string {
  return handleStatus(statusTexts(input), input.phase);
}

/** Each phase's message, given the seconds received and the verdict. */
function statusTexts({
  seconds,
  verdict,
}: StatusTextInput): StatusHandlers<RunPhase, string> {
  const title = verdict === undefined ? "" : ` ${verdict.title}.`;
  return {
    idle: () => "",
    running: ({ workload }) => `Running ${workload.name}…${title}`,
    finished: ({ workload }) => `Finished ${workload.name}.${title}`,
    stopped: ({ workload }) =>
      `Stopped ${workload.name} after ${String(seconds)} of ${String(durationSec(workload))} simulated seconds.${title}`,
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
  readonly workload: Workload;
  /** Every snapshot received, for the progress bar. */
  readonly snapshots: readonly MetricsSnapshot[];
  /** The run as of the deferred snapshots, and what it means. */
  readonly meaning: RunMeaning;
}

/** How far the run got, what it means, its totals, and its charts. */
function RunResults({ workload, snapshots, meaning }: RunResultsProps) {
  const totalSec = durationSec(workload);
  const doneSec = simulatedSec(snapshots);

  return (
    <div className={styles.results}>
      <p className={styles.progress}>
        <progress value={doneSec} max={totalSec} aria-label="Simulated time" />
        {doneSec} of {totalSec} simulated seconds
      </p>
      <RunMetrics meaning={meaning} />
    </div>
  );
}

interface RunMetricsProps {
  readonly meaning: RunMeaning;
}

/**
 * The verdict and findings, then the totals and charts as their evidence.
 * Memoized, so it draws again only when the deferred snapshots change, not
 * on every snapshot that `RunResults` sees.
 */
const RunMetrics = memo(function RunMetrics({
  meaning: { run, findings, phrasebook },
}: RunMetricsProps) {
  const charts = useMemo(() => runCharts(run), [run]);

  return (
    <>
      <Findings findings={findings} phrasebook={phrasebook} />
      <RunTotals run={run} />
      {charts.map((content) => (
        <TimeSeriesChart key={content.title} content={content} />
      ))}
    </>
  );
});
