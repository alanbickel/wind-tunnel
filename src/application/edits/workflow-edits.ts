import type {
  Step,
  StepAction,
  Workflow,
  Workload,
} from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";

// Edit commands (ADR-0019): each takes the project record and returns the
// next one, doing the whole change, so it's one undo step. They don't
// check the change: a field checks its draft first, and `SaveProject`
// checks the record it saves. A command for a workflow the project
// doesn't have returns the record unchanged.

/** A workflow, and its new name. */
export interface RenameWorkflowInput {
  readonly workflowId: string;
  readonly name: string;
}

/**
 * Renames a workflow. Workloads' mixes refer to it by id, so nothing else
 * changes. The same name returns the record as it was.
 */
export function renameWorkflow(
  record: ProjectRecord,
  { workflowId, name }: RenameWorkflowInput,
): ProjectRecord {
  const { project } = record;
  const found = project.workflows.find((w) => w.id === workflowId);
  if (found === undefined || found.name === name) return record;
  const rename = (w: Workflow): Workflow =>
    w.id === workflowId ? { ...w, name } : w;
  return {
    ...record,
    project: { ...project, workflows: project.workflows.map(rename) },
  };
}

/** A workflow to remove. */
export interface RemoveWorkflowInput {
  readonly workflowId: string;
}

/**
 * Removes a workflow, and its entries in every workload's mix, so no mix
 * names a workflow the project doesn't have. A workload left with an empty
 * mix gets the run issue for one. Undo needs nothing more: the history
 * keeps the record from before.
 */
export function removeWorkflow(
  record: ProjectRecord,
  { workflowId }: RemoveWorkflowInput,
): ProjectRecord {
  const { project } = record;
  if (!project.workflows.some((w) => w.id === workflowId)) return record;
  const leaveMix = (workload: Workload): Workload => ({
    ...workload,
    mix: workload.mix.filter((entry) => entry.workflowId !== workflowId),
  });
  return {
    ...record,
    project: {
      ...project,
      workflows: project.workflows.filter((w) => w.id !== workflowId),
      workloads: project.workloads.map(leaveMix),
    },
  };
}

/** A new workflow: its name, its ids, and its first step's component and action. */
export interface AddWorkflowInput {
  /** A new id, from the `IdGenerator` port. */
  readonly workflowId: string;
  /** A new id for the first step, from the `IdGenerator` port. */
  readonly rootStepId: string;
  readonly name: string;
  /** The component the first step calls. */
  readonly componentId: string;
  readonly action: StepAction;
}

/**
 * Adds a workflow, after the project's others, with one step: its root.
 * A workflow can't be stored without a root, so a new one is added only
 * once its first step has a component and an action, in one command and
 * so one undo step. Workloads' mixes don't change.
 */
export function addWorkflow(
  record: ProjectRecord,
  { workflowId, rootStepId, name, componentId, action }: AddWorkflowInput,
): ProjectRecord {
  const { project } = record;
  const root: Step = { id: rootStepId, componentId, action };
  const workflow: Workflow = { id: workflowId, name, root };
  return {
    ...record,
    project: { ...project, workflows: [...project.workflows, workflow] },
  };
}
