import { useId } from "react";
import type { Project } from "../../domain/model/project";
import { RunControls } from "../run/RunControls";
import { RunProgress } from "../run/RunProgress";
import { Button } from "../shared/Button";
import type { ProjectRun } from "../run/useProjectRun";
import { ScreenHeading } from "../shared/ScreenHeading";
import styles from "./ProjectBar.module.css";

export interface ProjectBarProps {
  readonly project: Project;
  readonly projectRun: ProjectRun;
  /** True once the last change failed to save, until a save works. */
  readonly saveFailed: boolean;
  /** Saves the change that failed again. */
  readonly onRetry: () => void;
}

/**
 * The top of a project screen, above both columns: the project's name and
 * description, then what runs it, how far the run has got, its status, and
 * whether it's out of date, and whether the last change saved.
 * A region named by the project, so a screen reader can jump to it.
 */
export function ProjectBar(props: ProjectBarProps) {
  const { project, projectRun, saveFailed, onRetry } = props;
  const { run, ran, status, outOfDate } = projectRun;
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.bar}>
      <div className={styles.intro}>
        <ScreenHeading id={headingId}>{project.name}</ScreenHeading>
        {project.description && (
          <p className={styles.description}>{project.description}</p>
        )}
      </div>
      <div className={styles.run}>
        <WorkloadControls project={project} projectRun={projectRun} />
        {ran !== undefined && (
          <RunProgress workload={ran} snapshots={run.snapshots} />
        )}
        <RunStatus status={status} outOfDate={outOfDate} />
        {/* Mounted from the start, like the run's status, so screen
            readers announce why the picked workload can't run when a
            change to the project stops it. */}
        <p role="status" className={styles.cantRun}>
          {cantRunReason(projectRun)}
        </p>
        <SaveStatus saveFailed={saveFailed} onRetry={onRetry} />
      </div>
    </section>
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

type SaveStatusProps = Pick<ProjectBarProps, "saveFailed" | "onRetry">;

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

type WorkloadControlsProps = Pick<ProjectBarProps, "project" | "projectRun">;

/** The run controls, on the picked workload; a line instead if there are none. */
function WorkloadControls({ project, projectRun }: WorkloadControlsProps) {
  const { run, picked, pick } = projectRun;
  if (picked === undefined) {
    return <p>This project has no workloads to run.</p>;
  }
  return (
    <RunControls
      workloads={project.workloads}
      workload={picked}
      onPick={pick}
      checks={projectRun.checks}
      running={run.phase.status === "running"}
      onStart={() => {
        run.start(picked);
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
