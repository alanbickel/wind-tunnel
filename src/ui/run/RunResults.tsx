import { memo, useMemo } from "react";
import { TimeSeriesChart } from "../charts/TimeSeriesChart";
import { Findings } from "./Findings";
import { runCharts } from "./run-charts";
import styles from "./RunResults.module.css";
import { RunTotals } from "./RunTotals";
import type { RunMeaning } from "./useRunFindings";

export interface RunResultsProps {
  /** The run as of the deferred snapshots, and what it means. */
  readonly meaning: RunMeaning | undefined;
}

/**
 * What the latest run means, then its totals and charts as the evidence;
 * a line saying so before the first run.
 */
export function RunResults({ meaning }: RunResultsProps) {
  if (meaning === undefined) {
    return <p className={styles.empty}>Nothing has run yet.</p>;
  }
  return (
    <div className={styles.results}>
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
