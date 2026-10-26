import { memo, useMemo } from "react";
import { TimeSeriesChart } from "../charts/TimeSeriesChart";
import { Findings } from "./Findings";
import { runCharts } from "./run-charts";
import styles from "./RunResults.module.css";
import { RunTotals } from "./RunTotals";
import type { RunMeaning } from "./useRunFindings";
import type { ProjectRun } from "./useProjectRun";

/**
 * What the results show of the screen's run: what it means, as of the
 * deferred snapshots, and whether the project has changed since it started.
 * A `ProjectRun` can be spread in.
 */
export type RunResultsProps = Pick<ProjectRun, "meaning" | "outOfDate">;

/**
 * What the latest run means, then its totals and charts as the evidence;
 * a line saying so before the first run. A run of an earlier version of
 * the project opens with a line saying so, and reads as it was.
 */
export function RunResults({ meaning, outOfDate }: RunResultsProps) {
  if (meaning === undefined) {
    return <p className={styles.empty}>Nothing has run yet.</p>;
  }
  return (
    <div className={styles.results}>
      {outOfDate && (
        <p className={styles.outOfDate}>
          This run is of an earlier version of the project. Run again to see
          your changes.
        </p>
      )}
      <RunMetrics meaning={meaning} />
    </div>
  );
}

interface RunMetricsProps {
  readonly meaning: RunMeaning;
}

/**
 * The verdict and findings, then the totals and charts. Memoized, so it
 * draws again only when the deferred snapshots change, not on every
 * snapshot that the project screen sees.
 */
const RunMetrics = memo(function RunMetrics({
  meaning: { run, findings, wording },
}: RunMetricsProps) {
  const charts = useMemo(() => runCharts(run), [run]);

  return (
    <>
      <Findings findings={findings} wording={wording} />
      <RunTotals run={run} />
      {charts.map((content) => (
        <TimeSeriesChart key={content.title} content={content} />
      ))}
    </>
  );
});
