import type { ReactNode } from "react";
import styles from "./RunLines.module.css";

/** Where a run's results go, before the first run. */
export function NothingRunYet() {
  return <p className={styles.empty}>Nothing has run yet.</p>;
}

interface RunColumnProps {
  /** Whether the run is of an earlier version of the project. */
  readonly outOfDate: boolean;
  readonly children: ReactNode;
}

/**
 * A run's results, one under another, opened by a line saying so when the
 * run is of an earlier version of the project: they read as it was.
 */
export function RunColumn({ outOfDate, children }: RunColumnProps) {
  return (
    <div className={styles.column}>
      {outOfDate && (
        <p className={styles.outOfDate}>
          This run is of an earlier version of the project. Run again to see
          your changes.
        </p>
      )}
      {children}
    </div>
  );
}
