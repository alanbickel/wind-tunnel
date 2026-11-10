import type {
  Step,
  StepAction,
  Workflow,
  Workload,
} from "../../domain/model/project";
import { mapSteps } from "../../domain/model/step-tree";
import type { EdgeSettings } from "../../domain/model/edge-settings";
import type { ProjectRecord } from "../ports/project-record";
import { connectIfMissing } from "./edge-edits";

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

/** A new call: whose it is, its ids and its step, and the edge it adds if one is missing. */
export interface AddCallInput extends StepInput {
  /** A new id for the call, from the `IdGenerator` port. */
  readonly callId: string;
  /** The component the call goes to. */
  readonly componentId: string;
  readonly action: StepAction;
  /** A new id for the edge, used only if the caller has none to the callee. */
  readonly edgeId: string;
  /** The caller type's `edgeDefaults`, which become that edge's settings. */
  readonly edgeSettings: EdgeSettings;
}

/**
 * Adds a call as the last of a step's calls (`stepId` is the caller). If the
 * caller's component has no edge to the call's, the same command adds one,
 * through `connectIfMissing`, so the call and its edge are one undo step
 * (UX design §2.5 step 5, ADR-0019 decision 4). A step that isn't the root
 * or one of a step's calls (async work stays read-only), or isn't in the
 * workflow, returns the record as it was.
 */
export function addCall(
  record: ProjectRecord,
  input: AddCallInput,
): ProjectRecord {
  const { workflowId, stepId, callId, componentId, action } = input;
  const workflow = record.project.workflows.find((w) => w.id === workflowId);
  const caller = workflow && stepInCalls(workflow, stepId);
  if (workflow === undefined || caller === undefined) return record;
  const call: Step = { id: callId, componentId, action };
  const append = (step: Step): Step =>
    step.id === stepId
      ? { ...step, calls: [...(step.calls ?? []), call] }
      : step;
  const withCall = withWorkflow(record, {
    ...workflow,
    root: mapSteps(workflow.root, append),
  });
  return connectIfMissing(withCall, {
    edgeId: input.edgeId,
    from: caller.componentId,
    to: componentId,
    settings: input.edgeSettings,
  });
}

/** A step's new component and action, and the edge a call along a missing one adds. */
export interface ChangeStepInput extends StepInput {
  /** The component the step now calls. */
  readonly componentId: string;
  readonly action: StepAction;
  /** A new id for the edge, used only if the caller has none to the new component. */
  readonly edgeId: string;
  /**
   * The caller type's `edgeDefaults`, which become that edge's settings;
   * undefined adds no edge (the root has no caller, and a caller whose
   * component is gone has no type to take them from).
   */
  readonly edgeSettings: EdgeSettings | undefined;
}

/**
 * Changes a step's component and action together, so it's never left
 * without either. The step keeps its id, its calls, and its `async` (which
 * can't change here). If the step's caller has no edge to the new
 * component, the same command adds one, through `connectIfMissing`, as
 * `addCall` does, so it's one undo step; the root has no caller, so it adds
 * none. A step that's the root or one of a step's calls (async work stays
 * read-only), or isn't in the workflow, returns the record as it was; so
 * does a change to what the step already is, unless its caller has no edge
 * to its component, which is still added.
 */
export function changeStep(
  record: ProjectRecord,
  input: ChangeStepInput,
): ProjectRecord {
  const { workflowId, stepId, componentId, action } = input;
  const workflow = record.project.workflows.find((w) => w.id === workflowId);
  const step = workflow && stepInCalls(workflow, stepId);
  if (workflow === undefined || step === undefined) return record;
  const unchanged = step.componentId === componentId && step.action === action;
  const caller = holderOf(workflow, stepId);
  const change = (s: Step): Step =>
    s.id === stepId ? { ...s, componentId, action } : s;
  const withStep = withWorkflow(record, {
    ...workflow,
    root: mapSteps(workflow.root, change),
  });
  const next = unchanged ? record : withStep;
  const { edgeId, edgeSettings: settings } = input;
  if (caller === undefined || settings === undefined) return next;
  return connectIfMissing(next, {
    edgeId,
    from: caller.componentId,
    to: componentId,
    settings,
  });
}

/**
 * The step with this id that a call can be added to: the root, or a step
 * reached by `calls` alone. Async work, and every step under it, isn't
 * searched: it stays read-only.
 */
export function stepInCalls(
  workflow: Workflow,
  stepId: string,
): Step | undefined {
  return stepUnderCalls(workflow.root, stepId);
}

function stepUnderCalls(step: Step, stepId: string): Step | undefined {
  if (step.id === stepId) return step;
  const found = (step.calls ?? []).map((call) => stepUnderCalls(call, stepId));
  return found.find(Boolean);
}

/** Which way a step moves among its siblings. */
export type StepDirection = "up" | "down";

/** A step, by id, in its workflow. */
export interface StepInput {
  readonly workflowId: string;
  readonly stepId: string;
}

/** A step to move, and which way. */
export interface MoveStepInput extends StepInput {
  readonly direction: StepDirection;
}

/** Where a move puts a step, from where it is. */
const MOVE_OFFSET: Record<StepDirection, number> = { up: -1, down: 1 };

/**
 * Moves a step one place up or down among its siblings, its calls with
 * it. A step that's at that end, has no siblings, isn't one of a step's
 * calls (the root, or async work, which stays read-only), or isn't in the
 * workflow returns the record as it was.
 */
export function moveStep(
  record: ProjectRecord,
  { workflowId, stepId, direction }: MoveStepInput,
): ProjectRecord {
  return changeCallsHolding(record, {
    workflowId,
    stepId,
    change: (calls) => {
      const from = calls.findIndex((call) => call.id === stepId);
      const to = from + MOVE_OFFSET[direction];
      const moved = calls[from];
      const swapped = calls[to];
      if (moved === undefined || swapped === undefined) return calls;
      const next = [...calls];
      next[from] = swapped;
      next[to] = moved;
      return next;
    },
  });
}

/**
 * Removes a step and everything under it, async work included. Edges
 * belong to the architecture, so none goes with it (ADR-0019). A step that
 * isn't one of a step's calls (the root, which a workflow's own remove
 * takes, or async work, which stays read-only) or isn't in the workflow
 * returns the record as it was.
 */
export function removeStep(
  record: ProjectRecord,
  { workflowId, stepId }: StepInput,
): ProjectRecord {
  return changeCallsHolding(record, {
    workflowId,
    stepId,
    change: (calls) => calls.filter((call) => call.id !== stepId),
  });
}

/** A change to one step's calls, as `changeCallsHolding` applies it. */
interface CallsChangeInput extends StepInput {
  /** The next calls of the step that holds `stepId` among its calls. */
  readonly change: (calls: readonly Step[]) => readonly Step[];
}

/**
 * Applies `change` to the calls of the step that holds `stepId` among them.
 * The record is returned as it was if the workflow, or such a holder, isn't
 * there, or `change` gives the very calls it was given back.
 */
function changeCallsHolding(
  record: ProjectRecord,
  { workflowId, stepId, change }: CallsChangeInput,
): ProjectRecord {
  const workflow = record.project.workflows.find((w) => w.id === workflowId);
  const holder = workflow && holderOf(workflow, stepId);
  if (workflow === undefined || holder === undefined) return record;
  const next = change(holder.calls ?? []);
  if (next === holder.calls) return record;
  const replace = (step: Step): Step =>
    step.id === holder.id ? withCalls(step, next) : step;
  return withWorkflow(record, {
    ...workflow,
    root: mapSteps(workflow.root, replace),
  });
}

/** The record with the workflow of the same id as `changed` replaced by it. */
function withWorkflow(record: ProjectRecord, changed: Workflow): ProjectRecord {
  const { project } = record;
  const swap = (w: Workflow): Workflow => (w.id === changed.id ? changed : w);
  return {
    ...record,
    project: { ...project, workflows: project.workflows.map(swap) },
  };
}

/**
 * The step of the workflow that has `stepId` among its calls: its caller. Async work, and
 * every step under it, is not searched: it stays read-only.
 */
export function holderOf(workflow: Workflow, stepId: string): Step | undefined {
  return holderUnder(workflow.root, stepId);
}

/** The step, or one under it by calls only, that has `stepId` among its calls. */
function holderUnder(step: Step, stepId: string): Step | undefined {
  const calls = step.calls ?? [];
  if (calls.some((call) => call.id === stepId)) return step;
  return calls.map((call) => holderUnder(call, stepId)).find(Boolean);
}

/** The step with these calls; a step with none has no `calls` at all. */
function withCalls(step: Step, calls: readonly Step[]): Step {
  if (calls.length > 0) return { ...step, calls };
  const { id, componentId, action, async } = step;
  return { id, componentId, action, ...(async && { async }) };
}
