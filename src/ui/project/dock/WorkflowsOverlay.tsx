import { useId, useMemo } from "react";
import type { Selection } from "../../../application/details/selection";
import type { Project } from "../../../domain/model/project";
import { useUseCases } from "../../app/useUseCases";
import { useAnnouncement } from "../../shared/useAnnouncement";
import { WorkflowList } from "../WorkflowList";
import { WorkflowOutline } from "../WorkflowOutline";
import type { OverlayProps } from "./overlay";
import styles from "./ListBesideEditor.module.css";

/**
 * The dock's Workflows tab, always there (UX design §7): the workflows on
 * its left, with "Add workflow" and each one's problems, and the open
 * workflow's outline on its right. A workflow opens here as it, or one of
 * its steps, is selected, and stays open while something else is selected
 * (rule 3), so the outline stays while you click its boxes. With none
 * open, the outline's place says what a workflow is.
 */
export function WorkflowsOverlay(props: OverlayProps) {
  const { project, selecting, addingWorkflow } = props;
  return (
    <div className={styles.tab}>
      <div className={styles.list}>
        <WorkflowList
          project={project}
          openWorkflowId={selecting.openWorkflowId}
          onSelect={selecting.select}
          adding={addingWorkflow}
        />
      </div>
      <OpenWorkflow {...props} />
    </div>
  );
}

/**
 * The open workflow's outline, keyed by the workflow, so one's drafts never
 * show in another's; or, with none open (none selected yet, or the open
 * one gone), what a workflow is, once there's one to open.
 */
function OpenWorkflow(props: OverlayProps) {
  const { project, selecting } = props;
  const open = project.workflows.find((w) => w.id === selecting.openWorkflowId);
  if (open !== undefined) {
    return <WorkflowEditor key={open.id} {...props} workflowId={open.id} />;
  }
  // With no workflows, the list already says what one is.
  if (project.workflows.length === 0) return null;
  return (
    <p className={styles.none}>
      A workflow is the path one kind of request takes through your
      architecture. Select one to see its steps.
    </p>
  );
}

interface WorkflowEditorProps extends OverlayProps {
  readonly workflowId: string;
}

/**
 * One workflow's outline, a region named by its heading, the workflow's
 * name, with the selected step marked in it. Its name, the workloads that
 * run it, and Remove are the inspector's. What a step's edit does is said
 * in the tab's own polite region, since the focus stays in the outline.
 */
function WorkflowEditor(props: WorkflowEditorProps) {
  const { project, selecting, onEdit, stepRows, workflowId } = props;
  const details = useWorkflowDetails(project, workflowId);
  const [announcement, announce] = useAnnouncement();
  const headingId = useId();
  if (details?.kind !== "workflow") return null;
  return (
    <section aria-labelledby={headingId} className={styles.editor}>
      <h4 id={headingId} className={styles.heading}>
        {details.name}
      </h4>
      <WorkflowOutline
        project={project}
        details={details}
        currentStepId={stepIn(selecting.selection, workflowId)}
        onSelect={selecting.select}
        onSelectWithin={selecting.selectWithin}
        onEdit={onEdit}
        announce={announce}
        stepRows={stepRows}
      />
      {/* On the page from the start, empty, so a screen reader announces
          a message put in it. */}
      <p role="status" className={styles.announcement}>
        {announcement}
      </p>
    </section>
  );
}

/** The workflow's details, as `describeSelection` says them. */
function useWorkflowDetails(project: Project, workflowId: string) {
  const { describeSelection } = useUseCases();
  return useMemo(
    () =>
      describeSelection.execute({
        project,
        selection: { kind: "workflow", workflowId },
      }),
    [describeSelection, project, workflowId],
  );
}

/** The selected step, if a step of the workflow is selected. */
function stepIn(
  selection: Selection | undefined,
  workflowId: string,
): string | undefined {
  if (selection?.kind !== "step" || selection.workflowId !== workflowId) {
    return undefined;
  }
  return selection.stepId;
}
