import { memo, useMemo } from "react";
import { TimeSeriesChart } from "../charts/TimeSeriesChart";
import type { TimeSeriesContent } from "../charts/time-series";
import { runCharts } from "./run-charts";
import styles from "./RunEvidence.module.css";
import { NothingRunYet, RunColumn } from "./RunLines";
import { RunTotals } from "./RunTotals";
import type { RunMeaning } from "./useRunFindings";
import type { ProjectRun } from "./useProjectRun";

/**
 * What the evidence shows of the screen's run: its snapshots, as of the
 * deferred ones, and whether the project has changed since it started.
 */
export type RunEvidenceProps = Pick<ProjectRun, "meaning" | "outOfDate">;

/**
 * The latest run's evidence: its totals, its timeline, then its charts,
 * folded, each chart with its table; a line saying so before the first
 * snapshot. A run of an earlier version of the project opens with a line
 * saying so, since the tables are of that version too. What the run means
 * is `RunExplanation`'s.
 */
export function RunEvidence({ meaning, outOfDate }: RunEvidenceProps) {
  if (meaning === undefined) return <NothingRunYet />;
  return (
    <RunColumn outOfDate={outOfDate}>
      <RunMetrics run={meaning.run} />
    </RunColumn>
  );
}

interface RunMetricsProps {
  readonly run: RunMeaning["run"];
}

/**
 * The totals, the timeline, and the charts. Memoized, so it draws again
 * only when the deferred snapshots change, not on every snapshot that the
 * project screen sees.
 */
const RunMetrics = memo(function RunMetrics({ run }: RunMetricsProps) {
  const { timeline, charts } = useMemo(() => runCharts(run), [run]);
  return (
    <>
      <RunTotals run={run} />
      <TimeSeriesChart content={timeline} size="compact" />
      <AllCharts charts={charts} />
    </>
  );
});

interface AllChartsProps {
  readonly charts: readonly TimeSeriesContent[];
}

/**
 * The full set of charts, folded under "Charts" until the user opens it.
 * The disclosure holds its own state, and the dock keeps its panels
 * mounted, so it stays as the user leaves it while the screen is open.
 * The charts stay mounted while folded, and fill their width once shown.
 */
function AllCharts({ charts }: AllChartsProps) {
  return (
    <details>
      <summary>Charts</summary>
      <div className={styles.charts}>
        {charts.map((content) => (
          <TimeSeriesChart key={content.title} content={content} />
        ))}
      </div>
    </details>
  );
}
