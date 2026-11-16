import { useId, useLayoutEffect, useRef } from "react";
import type { WorkloadRunChecks } from "../../application/run-checks/workload-run-checks";
import type { Project } from "../../domain/model/project";
import type { ProjectRun } from "../run/useProjectRun";
import styles from "./ProjectOverview.module.css";
import { NothingSelected } from "./SelectionDetails";
import { VerdictButton } from "./VerdictButton";

/** What the overview shows, and what its verdict does. */
export interface ProjectOverviewProps {
  readonly project: Project;
  readonly projectRun: ProjectRun;
  /** Selects the run, as the verdict beside Run does. */
  readonly onSelectRun: () => void;
  /**
   * Whether the heading should take the focus as it shows: true once,
   * after a close whose opener has gone, such as this overview's verdict.
   */
  readonly takeFocus: () => boolean;
}

/**
 * What the inspector shows with nothing selected (UX design §5): the
 * project's description, what it holds, its problems, and the
 * latest run's verdict, which selects the run. Never the run's
 * explanation: that shows only with the run, or a finding, selected.
 */
export function ProjectOverview(props: ProjectOverviewProps) {
  const { project, projectRun, onSelectRun, takeFocus } = props;
  const headingRef = useRef<HTMLHeadingElement>(null);
  // A layout effect, so the focus moves in the commit that shows it.
  useLayoutEffect(() => {
    if (takeFocus()) headingRef.current?.focus();
  }, [takeFocus]);
  return (
    <section aria-label="Overview">
      <h3 ref={headingRef} tabIndex={-1}>
        Overview
      </h3>
      {project.description && (
        <p className={styles.description}>{project.description}</p>
      )}
      <p className={styles.muted}>{holdings(project)}</p>
      <NothingSelected />
      <Problems checks={projectRun.checks} project={project} />
      <LatestRun projectRun={projectRun} onSelectRun={onSelectRun} />
    </section>
  );
}

/** "3 components, 2 workflows, no workloads." */
function holdings({ architecture, workflows, workloads }: Project): string {
  const parts = [
    counted(architecture.components.length, "component"),
    counted(workflows.length, "workflow"),
    counted(workloads.length, "workload"),
  ];
  return `${parts.join(", ")}.`;
}

/** "no workflows", "1 workflow", "2 workflows". */
function counted(n: number, noun: string): string {
  if (n === 0) return `no ${noun}s`;
  return n === 1 ? `1 ${noun}` : `${String(n)} ${noun}s`;
}

interface ProblemsProps {
  readonly project: Project;
  readonly checks: WorkloadRunChecks;
}

/**
 * Why each workload that can't run can't, in the project's order: the
 * problems that stop something, which show where they are as well.
 * Nothing when every workload can run.
 */
function Problems({ project, checks }: ProblemsProps) {
  const headingId = useId();
  // Keyed by the workload, since two workloads can give the same summary.
  const problems = project.workloads
    .map(({ id }) => ({ id, summary: checks.get(id)?.summary ?? "" }))
    .filter(({ summary }) => summary !== "");
  if (problems.length === 0) return null;
  return (
    <section aria-labelledby={headingId}>
      <h4 id={headingId}>Problems</h4>
      <ul>
        {problems.map(({ id, summary }) => (
          <li key={id}>{summary}</li>
        ))}
      </ul>
    </section>
  );
}

type LatestRunProps = Pick<ProjectOverviewProps, "projectRun" | "onSelectRun">;

/** The latest run's verdict, which selects the run; nothing before one. */
function LatestRun({ projectRun, onSelectRun }: LatestRunProps) {
  const headingId = useId();
  const { chip, outOfDate } = projectRun;
  if (chip === undefined) return null;
  return (
    <section aria-labelledby={headingId} className={styles.latest}>
      <h4 id={headingId}>Latest run</h4>
      <VerdictButton
        chip={chip}
        outOfDate={outOfDate}
        onSelectRun={onSelectRun}
      />
      <p className={styles.muted}>Select it to see why.</p>
    </section>
  );
}
