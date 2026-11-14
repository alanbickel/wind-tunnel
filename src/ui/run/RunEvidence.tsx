import { memo, useMemo } from "react";
import { TimeSeriesChart } from "../charts/TimeSeriesChart";
import { runCharts } from "./run-charts";
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
 * The latest run's evidence: its totals, then its charts, each with its
 * table; a line saying so before the first snapshot. A run of an earlier
 * version of the project opens with a line saying so, since the tables
 * are of that version too. What the run means is `RunResults`'.
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
 * The totals and charts. Memoized, so it draws again only when the
 * deferred snapshots change, not on every snapshot that the project
 * screen sees.
 */
const RunMetrics = memo(function RunMetrics({ run }: RunMetricsProps) {
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
