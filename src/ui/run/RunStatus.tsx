import { statusLookOf, type StatusLook } from "./run-status";
import type { ProjectRun } from "./useProjectRun";
import type { RunPhase } from "./useSimulationRun";
import styles from "./RunStatus.module.css";

export interface RunStatusProps extends Pick<
  ProjectRun,
  "status" | "outOfDate"
> {
  /** How the latest run went, which says whether its status shows. */
  readonly phase: RunPhase["status"];
}

const LOOK_CLASS: Record<StatusLook, string | undefined> = {
  heard: styles.heard,
  seen: styles.seen,
  error: styles.failed,
};

/**
 * The run's status, and whether it's out of date, in the run group. Both
 * regions are mounted with the group, so screen readers announce each
 * change: the run's status, with its verdict's title, then whether the run
 * is out of date, which changes on its own when the project does. The
 * chip says "Out of date" on screen, so that region is only heard.
 */
export function RunStatus({ status, outOfDate, phase }: RunStatusProps) {
  return (
    <>
      <p role="status" className={LOOK_CLASS[statusLookOf(phase)]}>
        {status}
      </p>
      <p role="status" className={styles.heard}>
        {outOfDate ? "Out of date" : ""}
      </p>
    </>
  );
}
