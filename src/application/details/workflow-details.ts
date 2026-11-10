import type { Project, Step, Workflow } from "../../domain/model/project";
import type { WorkflowRunCheck } from "../run-checks/workflow-run-checks";
import { stepsBelow } from "../../domain/model/step-tree";
import type {
  AsyncSlot,
  OutlineStep,
  StepEditing,
  WorkflowDetails,
} from "./details";
import { stepRemovalText, workflowRemovalText } from "./removal-text";

/** A workflow, in its project, its run issues, and the step selected in it, if any. */
export interface WorkflowDetailsInput {
  readonly project: Project;
  readonly workflow: Workflow;
  /** Each step's issues, by step ID. */
  readonly onSteps: WorkflowRunCheck["onSteps"];
  readonly currentStepId: string | undefined;
}

/**
 * A workflow's details: its name, the workloads that use it, and its steps
 * as a numbered outline, each named by its component and its action, with
 * its run issues.
 */
export function workflowDetails({
  project,
  workflow,
  onSteps,
  currentStepId,
}: WorkflowDetailsInput): WorkflowDetails {
  const context = { project, onSteps };
  const usedBy = workloadsUsing(project, workflow.id);
  return {
    kind: "workflow",
    workflowId: workflow.id,
    name: workflow.name,
    usedBy,
    removal: workflowRemovalText({ workflow, usedBy }),
    outline: outlineOf(
      { step: workflow.root, number: "1", place: undefined },
      context,
    ),
    currentStepId,
  };
}

/**
 * What Details says about a workflow's workloads: "Used by: Lunch rush,
 * Steady day", or "Used by: no workload yet". The names are joined with
 * semicolons if one has a comma of its own, as the templates' "Lunch rush,
 * 20 s at 2,000 requests/s" does, so each still reads as one name.
 */
export function usedByLine(usedBy: readonly string[]): string {
  if (usedBy.length === 0) return "Used by: no workload yet";
  const separator = usedBy.some((name) => name.includes(",")) ? "; " : ", ";
  return `Used by: ${usedBy.join(separator)}`;
}

/** What Details says above an `enqueue` step's async work. */
export const ASYNC_WORK_HEADING =
  "Async work, done when a consumer takes the message";

/** What Details says in an `enqueue` step's empty async slot. */
export const NO_ASYNC_WORK_TEXT =
  "No async work yet. A message is taken off the queue and nothing runs.";

/** The words of the button that opens a draft of async work. */
export const ADD_ASYNC_WORK_LABEL =
  "Add async work, done when a consumer takes the message";

/** The names of the workloads whose mix has the workflow, in project order. */
function workloadsUsing(project: Project, workflowId: string): string[] {
  return project.workloads
    .filter((workload) =>
      workload.mix.some((entry) => entry.workflowId === workflowId),
    )
    .map((workload) => workload.name);
}

/** A step, and its number in the outline. */
interface NumberedStep {
  readonly step: Step;
  readonly number: string;
  /** Where it is among its caller's calls; undefined for the root and for async work. */
  readonly place: StepPlace | undefined;
}

/** A step's place among its caller's calls. */
interface StepPlace {
  readonly callerStepId: string;
  readonly index: number;
  readonly siblings: number;
}

/** What every line of the outline is drawn from. */
interface OutlineContext {
  readonly project: Project;
  readonly onSteps: WorkflowRunCheck["onSteps"];
}

/** A step under another: its place in the outline, and among its caller's calls, if it's one. */
interface UnderInput {
  readonly child: Step;
  readonly index: number;
  readonly from: StepPlace | undefined;
}

/**
 * The step's line in the outline, with the steps under it: its calls
 * numbered in order under its own number, then its async work after them.
 */
function outlineOf(
  { step, number, place }: NumberedStep,
  context: OutlineContext,
): OutlineStep {
  const { project, onSteps } = context;
  const calls = step.calls ?? [];
  const under = ({ child, index, from }: UnderInput) =>
    outlineOf(
      { step: child, number: `${number}.${String(index + 1)}`, place: from },
      context,
    );
  const label = `${componentName(project, step.componentId)} · ${step.action}`;
  return {
    stepId: step.id,
    number,
    label,
    issues: onSteps.get(step.id) ?? [],
    calls: calls.map((child, index) =>
      under({ child, index, from: placeAmongCalls({ step, index }) }),
    ),
    async: step.async && asyncOutline(step.async, { step, under, context }),
    asyncSlot: asyncSlot(step, context),
    description: undefined,
    editing: place && stepEditing({ step, label, place }),
    addCallLabel: addCallLabel(step, context),
  };
}

/** What `asyncOutline` needs: the queue step, how to outline a step under it, and the context. */
interface AsyncOutlineInput {
  readonly step: Step;
  readonly under: (input: UnderInput) => OutlineStep;
  readonly context: OutlineContext;
}

/**
 * The outline of a queue step's async root, numbered after the queue's
 * calls. The root is its slot's only step, so it has no siblings to move
 * among; its caller is the queue, and its description says when it runs.
 */
function asyncOutline(
  root: Step,
  { step: queue, under, context }: AsyncOutlineInput,
): OutlineStep {
  const place: StepPlace = { callerStepId: queue.id, index: 0, siblings: 1 };
  const outline = under({
    child: root,
    index: queue.calls?.length ?? 0,
    from: place,
  });
  const queueName = componentName(context.project, queue.componentId);
  return {
    ...outline,
    description: `Runs when a consumer takes the message from ${queueName}.`,
    editing: outline.editing && {
      ...outline.editing,
      emptiesSlotOf: `${queueName} · ${queue.action}`,
    },
  };
}

/** Whether the project has a component with this id. */
function hasComponent(project: Project, componentId: string): boolean {
  return project.architecture.components.some((c) => c.id === componentId);
}

/**
 * "Add a call from api", or undefined where a step can't take a call: a
 * step whose component is gone, and an `enqueue`, whose follow-up work is
 * its async work (ADR-0021 decision 3).
 */
function addCallLabel(step: Step, context: OutlineContext): string | undefined {
  const { project } = context;
  if (!hasComponent(project, step.componentId)) return undefined;
  if (step.action === "enqueue") return undefined;
  return `Add a call from ${componentName(project, step.componentId)}`;
}

/**
 * The empty async slot of an `enqueue` step: undefined for any other step,
 * for one that has async work, and for one whose component is gone, which
 * has no edges to offer.
 */
function asyncSlot(step: Step, context: OutlineContext): AsyncSlot | undefined {
  if (step.action !== "enqueue" || step.async !== undefined) return undefined;
  if (!hasComponent(context.project, step.componentId)) return undefined;
  return { text: NO_ASYNC_WORK_TEXT, addLabel: ADD_ASYNC_WORK_LABEL };
}

/** A call of a step, by its position among them. */
interface CallInput {
  readonly step: Step;
  readonly index: number;
}

/** The place of a step's call among its calls. */
function placeAmongCalls({ step, index }: CallInput): StepPlace {
  return {
    callerStepId: step.id,
    index,
    siblings: step.calls?.length ?? 0,
  };
}

/** A step that's one of a step's calls, its label, and its place among them. */
interface StepEditingInput {
  readonly step: Step;
  readonly label: string;
  readonly place: StepPlace;
}

/** What Move up, Move down, and Remove need for a step. */
function stepEditing({ step, label, place }: StepEditingInput): StepEditing {
  const { callerStepId, index, siblings } = place;
  return {
    callerStepId,
    moves:
      siblings < 2
        ? undefined
        : { canMoveUp: index > 0, canMoveDown: index < siblings - 1 },
    removal: stepRemovalText({ label, stepsBelow: stepsBelow(step).length }),
    emptiesSlotOf: undefined,
  };
}

/**
 * The component's name, or "a removed component" if the project has none
 * by that id: a component's id is never shown (UX design §5).
 */
export function componentName(project: Project, componentId: string): string {
  return (
    project.architecture.components.find((c) => c.id === componentId)?.name ??
    "a removed component"
  );
}
