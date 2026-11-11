import { memo, useMemo } from "react";
import { TimeSeriesChart } from "../charts/TimeSeriesChart";
import type { FindingSelecting } from "./finding-selecting";
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
export interface RunResultsProps extends Pick<
  ProjectRun,
  "meaning" | "outOfDate"
> {
  /** Which finding is selected, and how to select one. */
  readonly findingSelecting: FindingSelecting;
}

/**
 * What the latest run means, then its totals and charts as the evidence;
 * a line saying so before the first run. A run of an earlier version of
 * the project opens with a line saying so, and reads as it was.
 */
export function RunResults(props: RunResultsProps) {
  const { meaning, outOfDate, findingSelecting } = props;
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
      <RunMetrics meaning={meaning} selecting={findingSelecting} />
    </div>
  );
}

interface RunMetricsProps {
  readonly meaning: RunMeaning;
  readonly selecting: FindingSelecting;
}

/**
 * The verdict and findings, then the totals and charts. Memoized, so it
 * draws again only when the deferred snapshots change, not on every
 * snapshot that the project screen sees.
 */
const RunMetrics = memo(function RunMetrics({
  meaning: { run, findings, wording },
  selecting,
}: RunMetricsProps) {
  const charts = useMemo(() => runCharts(run), [run]);

  return (
    <>
      <Findings findings={findings} wording={wording} selecting={selecting} />
      <RunTotals run={run} />
      {charts.map((content) => (
        <TimeSeriesChart key={content.title} content={content} />
      ))}
    </>
  );
});
