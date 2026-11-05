import type { Project, Step, Workflow } from "../../domain/model/project";
import type { WorkflowRunCheck } from "../run-checks/workflow-run-checks";
import type { OutlineStep, WorkflowDetails } from "./details";

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
  return {
    kind: "workflow",
    workflowId: workflow.id,
    name: workflow.name,
    usedBy: workloadsUsing(project, workflow.id),
    outline: outlineOf({ step: workflow.root, number: "1" }, context),
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
}

/** What every line of the outline is drawn from. */
interface OutlineContext {
  readonly project: Project;
  readonly onSteps: WorkflowRunCheck["onSteps"];
}

/**
 * The step's line in the outline, with the steps under it: its calls
 * numbered in order under its own number, then its async work after them.
 */
function outlineOf(
  { step, number }: NumberedStep,
  context: OutlineContext,
): OutlineStep {
  const { project, onSteps } = context;
  const calls = step.calls ?? [];
  const under = (child: Step, index: number) =>
    outlineOf(
      { step: child, number: `${number}.${String(index + 1)}` },
      context,
    );
  return {
    stepId: step.id,
    number,
    label: `${componentName(project, step.componentId)} · ${step.action}`,
    issues: onSteps.get(step.id) ?? [],
    calls: calls.map(under),
    async: step.async && under(step.async, calls.length),
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
