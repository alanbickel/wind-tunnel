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

/**
 * How each phase's status is drawn. The verdict chip and the progress bar
 * show a run's state, so its status is only heard; a failed run's problem
 * shows nowhere else, so it's seen too.
 */
const STATUS_CLASS: Record<RunPhase["status"], string | undefined> = {
  idle: styles.heard,
  running: styles.heard,
  finished: styles.heard,
  stopped: styles.heard,
  failed: styles.failed,
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
      <p role="status" className={STATUS_CLASS[phase]}>
        {status}
      </p>
      <p role="status" className={styles.heard}>
        {outOfDate ? "Out of date" : ""}
      </p>
    </>
  );
}
