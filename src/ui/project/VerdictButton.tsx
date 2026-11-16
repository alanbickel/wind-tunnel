import type { ProjectRun } from "../run/useProjectRun";
import styles from "./VerdictButton.module.css";

/** The verdict to show, and what selecting it does. */
export interface VerdictButtonProps extends Pick<
  ProjectRun,
  "chip" | "outOfDate"
> {
  /** Selects the run, so the inspector explains it (UX design §5, rule 4). */
  readonly onSelectRun: () => void;
}

/**
 * The run's verdict, as a button that selects the run: beside Run, and in
 * the project's overview. The level colours it and its words say it; "Out
 * of date" goes on it once the project has changed since the run. With no
 * run, there's none, so the run can't be selected (UX design §5's limit
 * "no run"). The status line still announces the verdict, so this isn't a
 * live region.
 */
export function VerdictButton({
  chip,
  outOfDate,
  onSelectRun,
}: VerdictButtonProps) {
  if (chip === undefined) return null;
  return (
    <button
      type="button"
      className={styles.verdict}
      data-level={chip.level}
      onClick={onSelectRun}
    >
      <span>{chip.text}</span>
      {outOfDate && <span className={styles.stale}>Out of date</span>}
      <span className={styles.action}>. Show the run</span>
    </button>
  );
}
