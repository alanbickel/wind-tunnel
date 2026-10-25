import type { MetricsSnapshot } from "../../domain/metrics/metrics-snapshot";
import type { Workload } from "../../domain/model/project";
import { durationSec, simulatedSec } from "./run-status";
import styles from "./RunProgress.module.css";

export interface RunProgressProps {
  readonly workload: Workload;
  /** Every snapshot received, not the deferred copy, so it stays current. */
  readonly snapshots: readonly MetricsSnapshot[];
}

/** How far a run got, in simulated seconds, as a bar and in words. */
export function RunProgress({ workload, snapshots }: RunProgressProps) {
  const totalSec = durationSec(workload);
  const doneSec = simulatedSec(snapshots);

  return (
    <p className={styles.progress}>
      <progress value={doneSec} max={totalSec} aria-label="Simulated time" />
      {doneSec} of {totalSec} simulated seconds
    </p>
  );
}
