import type { Project, Step, Workflow } from "../../domain/model/project";
import type { WorkflowRunCheck } from "../run-checks/workflow-run-checks";
import { stepsBelow } from "../../domain/model/step-tree";
import type { OutlineStep, StepEditing, WorkflowDetails } from "./details";
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
  const context = { project, onSteps, editable: true };
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
  /** False under async work, which stays read-only: no step there is editable. */
  readonly editable: boolean;
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
  const under = ({ child, index, from }: UnderInput, inner = context) =>
    outlineOf(
      { step: child, number: `${number}.${String(index + 1)}`, place: from },
      inner,
    );
  const asyncWork = { ...context, editable: false };
  const label = `${componentName(project, step.componentId)} · ${step.action}`;
  return {
    stepId: step.id,
    number,
    label,
    issues: onSteps.get(step.id) ?? [],
    calls: calls.map((child, index) =>
      under({ child, index, from: placeAmongCalls({ step, index }, context) }),
    ),
    async:
      step.async &&
      under(
        { child: step.async, index: calls.length, from: undefined },
        asyncWork,
      ),
    editing: place && stepEditing({ step, label, place }),
  };
}

/** A call of a step, by its position among them. */
interface CallInput {
  readonly step: Step;
  readonly index: number;
}

/** The place of a step's call among its calls; undefined where nothing is editable. */
function placeAmongCalls(
  { step, index }: CallInput,
  { editable }: OutlineContext,
): StepPlace | undefined {
  if (!editable) return undefined;
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
