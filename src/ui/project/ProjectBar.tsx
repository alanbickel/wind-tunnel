import type { Project, Workload } from "../../domain/model/project";
import { RunControls } from "../run/RunControls";
import { RunProgress } from "../run/RunProgress";
import { Button } from "../shared/Button";
import type { ProjectRun } from "../run/useProjectRun";
import { inSentence } from "../shared/in-sentence";
import styles from "./ProjectBar.module.css";
import type { UndoRedo } from "./useUndoRedo";

export interface ProjectBarProps {
  readonly project: Project;
  readonly projectRun: ProjectRun;
  readonly undoRedo: UndoRedo;
  /** The ID of `ProjectStatus`'s line on why the picked workload can't run. */
  readonly cantRunReasonId: string;
  /** Called when Run starts a run, so the screen can show its results. */
  readonly onRunStart: () => void;
  /** Called when Edit is pressed, with the workload the picker shows. */
  readonly onEditWorkload: (workload: Workload) => void;
}

/**
 * The project's controls in the top bar's row, after its name: Undo and
 * Redo, then what runs it. `ProjectStatus` says what they did, on the
 * line under them.
 */
export function ProjectBar({ undoRedo, ...run }: ProjectBarProps) {
  return (
    <div className={styles.bar}>
      <UndoControls {...undoRedo} />
      <div className={styles.runGroup}>
        <VerdictChip
          chip={run.projectRun.chip}
          outOfDate={run.projectRun.outOfDate}
        />
        <WorkloadControls {...run} />
      </div>
    </div>
  );
}

export interface ProjectStatusProps {
  readonly projectRun: ProjectRun;
  /** For the line on why the picked workload can't run, which Run points to. */
  readonly cantRunReasonId: string;
  /** True once the last change failed to save, until a save works. */
  readonly saveFailed: boolean;
  /** Saves the change that failed again. */
  readonly onRetry: () => void;
}

/**
 * The top bar's status line, across the window under its row: how far the
 * run has got, its status, whether it's out of date, why the picked
 * workload can't run, and whether the last change saved. Its regions are
 * there from the start; while they're all empty, it takes no room.
 */
export function ProjectStatus(props: ProjectStatusProps) {
  const { projectRun, cantRunReasonId, saveFailed, onRetry } = props;
  const { run, ran, status, outOfDate } = projectRun;
  return (
    <div className={styles.line}>
      {ran !== undefined && (
        <RunProgress workload={ran} snapshots={run.snapshots} />
      )}
      <RunStatus status={status} outOfDate={outOfDate} />
      <CantRunReason id={cantRunReasonId} projectRun={projectRun} />
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
      <Button ref={undoButton} onClick={undo} usable={nextUndo !== undefined}>
        {buttonText("Undo", nextUndo)}
      </Button>
      <Button ref={redoButton} onClick={redo} usable={nextRedo !== undefined}>
        {buttonText("Redo", nextRedo)}
      </Button>
      <span role="status" className={styles.undone}>
        {announcement}
      </span>
    </div>
  );
}

/** "Undo remove orders-db", or "Undo" with nothing to undo. */
function buttonText(verb: string, description: string | undefined): string {
  if (description === undefined) return verb;
  return `${verb} ${inSentence(description)}`;
}

type VerdictChipProps = Pick<ProjectRun, "chip" | "outOfDate">;

/**
 * The run's verdict beside Run, drawn only: the status line's regions still
 * announce it, so this isn't one. The level colours it and its text says it
 * in words; with no run, nothing is drawn. "Out of date" goes on it once the
 * project has changed since the run.
 */
function VerdictChip({ chip, outOfDate }: VerdictChipProps) {
  if (chip === undefined) return null;
  return (
    <p className={styles.chip} data-level={chip.level}>
      <span>{chip.text}</span>
      {outOfDate && <span className={styles.chipStale}>Out of date</span>}
    </p>
  );
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

interface CantRunReasonProps {
  readonly id: string;
  readonly projectRun: ProjectRun;
}

/**
 * Why the picked workload can't run. Mounted from the start, like the run's
 * status, so screen readers announce it when a change to the project stops
 * the workload; Run points to it by `id`, so it's read on Run too.
 */
function CantRunReason({ id, projectRun }: CantRunReasonProps) {
  return (
    <p id={id} role="status" className={styles.cantRun}>
      {cantRunReason(projectRun)}
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

type WorkloadControlsProps = Omit<ProjectBarProps, "undoRedo">;

/** The run controls, on the picked workload; a line instead if there are none. */
function WorkloadControls(props: WorkloadControlsProps) {
  const { project, projectRun, cantRunReasonId, onRunStart } = props;
  const { onEditWorkload } = props;
  const { run, picked, pick } = projectRun;
  if (picked === undefined) {
    return <p>This project has no workloads to run.</p>;
  }
  return (
    <RunControls
      workloads={project.workloads}
      workload={picked}
      onPick={pick}
      onEdit={() => {
        onEditWorkload(picked);
      }}
      checks={projectRun.checks}
      cantRunReasonId={cantRunReasonId}
      running={run.phase.status === "running"}
      onStart={() => {
        run.start(picked);
        onRunStart();
      }}
      onStop={run.stop}
    />
  );
}

/** Why the picked workload can't run; empty if it can, or there's none. */
function cantRunReason({ picked, checks }: ProjectRun): string {
  if (picked === undefined) return "";
  return checks.get(picked.id)?.summary ?? "";
}
