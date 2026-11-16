import type { ReactNode, Ref } from "react";
import { Button } from "../shared/Button";
import type { ProjectRun } from "../run/useProjectRun";
import { RedoIcon, UndoIcon } from "../shared/ArrowIcons";
import { inSentence } from "../shared/in-sentence";
import styles from "./ProjectBar.module.css";
import type { UndoRedo } from "./useUndoRedo";

export interface ProjectBarProps {
  readonly undoRedo: UndoRedo;
  /**
   * The run group, when the layout puts it in the top bar: a narrow
   * window's, so Run is never scrolled out of sight.
   */
  readonly runGroup?: ReactNode;
}

/**
 * The project's controls in the top bar's row, after its name: Undo and
 * Redo, then, in a narrow window, the run group, whole. `ProjectStatus`
 * says what they did, on the line under them.
 */
export function ProjectBar({ undoRedo, runGroup }: ProjectBarProps) {
  return (
    <div className={styles.bar}>
      <UndoControls {...undoRedo} />
      {runGroup !== undefined && (
        <div className={styles.runGroup}>{runGroup}</div>
      )}
    </div>
  );
}

export interface ProjectStatusProps {
  readonly projectRun: ProjectRun;
  /** True once the last change failed to save, until a save works. */
  readonly saveFailed: boolean;
  /** Saves the change that failed again. */
  readonly onRetry: () => void;
}

/**
 * The top bar's status line, across the window under its row: the run's
 * status, whether it's out of date, and whether the last change saved.
 * Its regions are there from the start; while they're all empty, it takes
 * no room.
 */
export function ProjectStatus(props: ProjectStatusProps) {
  const { projectRun, saveFailed, onRetry } = props;
  const { status, outOfDate } = projectRun;
  return (
    <div className={styles.line}>
      <RunStatus status={status} outOfDate={outOfDate} />
      <SaveStatus saveFailed={saveFailed} onRetry={onRetry} />
    </div>
  );
}

/**
 * Undo and Redo, each naming what it would do: "Undo remove orders-db".
 * With nothing to do, each says only "Undo" or "Redo" and is unusable,
 * but keeps the focus. What one did is announced from a polite region
 * that's there from the start (UX design §4.4), since the change can be
 * anywhere on the screen; it's hidden from sight, as the screen shows it.
 */
function UndoControls(props: UndoRedo) {
  const { undo, redo, undoButton, redoButton } = props;
  const { nextUndo, nextRedo, announcement } = props;
  return (
    <div className={styles.undo}>
      <HistoryButton
        ref={undoButton}
        onClick={undo}
        usable={nextUndo !== undefined}
        text={buttonText("Undo", nextUndo)}
      >
        <UndoIcon />
      </HistoryButton>
      <HistoryButton
        ref={redoButton}
        onClick={redo}
        usable={nextRedo !== undefined}
        text={buttonText("Redo", nextRedo)}
      >
        <RedoIcon />
      </HistoryButton>
      <span role="status" className={styles.undone}>
        {announcement}
      </span>
    </div>
  );
}

interface HistoryButtonProps {
  /** What it says, and its tooltip: "Undo remove orders-db". */
  readonly text: string;
  readonly usable: boolean;
  readonly onClick: () => void;
  readonly ref: Ref<HTMLButtonElement>;
  /** The icon. */
  readonly children: ReactNode;
}

/**
 * An icon button whose name is its text, hidden from sight: the same text
 * is the tooltip.
 */
function HistoryButton(props: HistoryButtonProps) {
  const { text, usable, onClick, ref, children } = props;
  return (
    <Button
      ref={ref}
      variant="icon"
      onClick={onClick}
      usable={usable}
      title={text}
    >
      {children}
      <span className={styles.undone}>{text}</span>
    </Button>
  );
}

/** "Undo remove orders-db", or "Undo" with nothing to undo. */
function buttonText(verb: string, description: string | undefined): string {
  if (description === undefined) return verb;
  return `${verb} ${inSentence(description)}`;
}

type RunStatusProps = Pick<ProjectRun, "status" | "outOfDate">;

/**
 * The run's status, and whether it's out of date. Both regions are mounted
 * from the start, so screen readers announce each change: the run's status,
 * then whether the run is out of date, which changes on its own when the
 * project does.
 */
function RunStatus({ status, outOfDate }: RunStatusProps) {
  return (
    <p className={styles.status}>
      <span role="status">{status}</span>
      <span role="status" className={styles.outOfDate}>
        {outOfDate ? "Out of date" : ""}
      </span>
    </p>
  );
}

type SaveStatusProps = Pick<ProjectStatusProps, "saveFailed" | "onRetry">;

/**
 * Says when the last change didn't save, and offers to save it again
 * (UX design §4.3). The message's region is mounted from the start, empty,
 * so screen readers announce it; Try again sits outside it, so it isn't
 * read as part of the message.
 */
function SaveStatus({ saveFailed, onRetry }: SaveStatusProps) {
  return (
    <p className={styles.saveStatus}>
      <span role="status" className={styles.saveFailed}>
        {saveFailed ? "Couldn't save your last change." : ""}
      </span>
      {saveFailed && <Button onClick={onRetry}>Try again</Button>}
    </p>
  );
}
