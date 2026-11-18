import { useId } from "react";
import type { Project } from "../../../domain/model/project";
import { RunControls } from "../../run/RunControls";
import { RunProgress } from "../../run/RunProgress";
import { RunStatus } from "../../run/RunStatus";
import type { ProjectRun } from "../../run/useProjectRun";
import { VerdictButton } from "../VerdictButton";
import styles from "./RunGroup.module.css";

export interface RunGroupProps {
  readonly project: Project;
  readonly projectRun: ProjectRun;
  /** Called when Run starts a run, so the screen can select it. */
  readonly onRunStart: () => void;
  /** Called when the verdict is pressed, to select the run again. */
  readonly onSelectRun: () => void;
}

/**
 * The run group (UX design §2): the workload Run runs, Run and Stop, and
 * the verdict, as one unit wherever the layout puts it (§5 rule 6), at the
 * end of the dock's tab strip or, in a narrow window, in the top bar.
 * While a run goes, its progress is beside Stop; when the picked workload
 * can't run, the reason is beside Run. The run's status and "Out of date"
 * are announced from here, since the top bar says nothing about the run.
 * Picking a workload here changes only what Run runs, never the selection
 * (rule 5).
 */
export function RunGroup(props: RunGroupProps) {
  const { projectRun, onSelectRun } = props;
  const { run, ran } = projectRun;
  const cantRunReasonId = useId();
  return (
    <div role="group" aria-label="Run" className={styles.group}>
      <WorkloadControls {...props} cantRunReasonId={cantRunReasonId} />
      {run.phase.status === "running" && ran !== undefined && (
        <RunProgress workload={ran} snapshots={run.snapshots} />
      )}
      <RunStatus
        status={projectRun.status}
        outOfDate={projectRun.outOfDate}
        phase={run.phase.status}
      />
      <CantRunReason id={cantRunReasonId} projectRun={projectRun} />
      <VerdictButton
        chip={projectRun.chip}
        outOfDate={projectRun.outOfDate}
        onSelectRun={onSelectRun}
      />
    </div>
  );
}

interface WorkloadControlsProps extends Omit<RunGroupProps, "onSelectRun"> {
  /** The ID of the line on why the picked workload can't run. */
  readonly cantRunReasonId: string;
}

/** The run controls, on the picked workload; a line instead if there are none. */
function WorkloadControls(props: WorkloadControlsProps) {
  const { project, projectRun, cantRunReasonId, onRunStart } = props;
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

interface CantRunReasonProps {
  readonly id: string;
  readonly projectRun: ProjectRun;
}

/**
 * Why the picked workload can't run, beside Run. Mounted with the group,
 * like the run's status, after it, so screen readers announce it when a
 * change to the project stops the workload; Run points to it by `id`, so
 * it's read on Run too.
 */
function CantRunReason({ id, projectRun }: CantRunReasonProps) {
  return (
    <p id={id} role="status" className={styles.cantRun}>
      {cantRunReason(projectRun)}
    </p>
  );
}

/** Why the picked workload can't run; empty if it can, or there's none. */
function cantRunReason({ picked, checks }: ProjectRun): string {
  if (picked === undefined) return "";
  return checks.get(picked.id)?.summary ?? "";
}
