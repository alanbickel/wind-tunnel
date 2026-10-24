import type { Project } from "../../domain/model/project";
import { RunControls } from "../run/RunControls";
import { RunProgress } from "../run/RunProgress";
import type { ProjectRun } from "../run/useProjectRun";
import { ScreenHeading } from "../shared/ScreenHeading";
import styles from "./ProjectBar.module.css";

export interface ProjectBarProps {
  readonly project: Project;
  readonly projectRun: ProjectRun;
}

/**
 * The top of a project screen, above both columns: the project's name and
 * description, then what runs it, how far the run has got, and its status.
 */
export function ProjectBar({ project, projectRun }: ProjectBarProps) {
  const { run, ran, status } = projectRun;
  return (
    <div className={styles.bar}>
      <div className={styles.intro}>
        <ScreenHeading>{project.name}</ScreenHeading>
        {project.description && (
          <p className={styles.description}>{project.description}</p>
        )}
      </div>
      <div className={styles.run}>
        <WorkloadControls project={project} projectRun={projectRun} />
        {ran !== undefined && (
          <RunProgress workload={ran} snapshots={run.snapshots} />
        )}
        {/* Mounted from the start, so screen readers announce each change. */}
        <p role="status" className={styles.status}>
          {status}
        </p>
      </div>
    </div>
  );
}

/** The run controls, on the picked workload; a line instead if there are none. */
function WorkloadControls({ project, projectRun }: ProjectBarProps) {
  const { run, picked, pick } = projectRun;
  if (picked === undefined) {
    return <p className={styles.none}>This project has no workloads to run.</p>;
  }
  return (
    <RunControls
      workloads={project.workloads}
      workload={picked}
      onPick={pick}
      running={run.phase.status === "running"}
      onStart={() => {
        run.start(picked);
      }}
      onStop={run.stop}
    />
  );
}
