import type { Project, Step, Workflow } from "../../domain/model/project";
import type { OutlineStep, WorkflowDetails } from "./details";

/** A workflow, in its project, and the step selected in it, if any. */
export interface WorkflowDetailsInput {
  readonly project: Project;
  readonly workflow: Workflow;
  readonly currentStepId: string | undefined;
}

/**
 * A workflow's details: its name, the workloads that use it, and its steps
 * as a numbered outline, each named by its component and its action.
 */
export function workflowDetails({
  project,
  workflow,
  currentStepId,
}: WorkflowDetailsInput): WorkflowDetails {
  return {
    kind: "workflow",
    workflowId: workflow.id,
    name: workflow.name,
    usedBy: workloadsUsing(project, workflow.id),
    outline: outlineOf(project, { step: workflow.root, number: "1" }),
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

/**
 * The step's line in the outline, with the steps under it: its calls
 * numbered in order under its own number, then its async work after them.
 */
function outlineOf(
  project: Project,
  { step, number }: NumberedStep,
): OutlineStep {
  const calls = step.calls ?? [];
  const under = (child: Step, index: number) =>
    outlineOf(project, {
      step: child,
      number: `${number}.${String(index + 1)}`,
    });
  return {
    stepId: step.id,
    number,
    label: `${componentName(project, step.componentId)} · ${step.action}`,
    calls: calls.map(under),
    async: step.async && under(step.async, calls.length),
  };
}

/**
 * The component's name, or "a removed component" if the project has none
 * by that id: a component's id is never shown (UX design §5).
 */
function componentName(project: Project, componentId: string): string {
  return (
    project.architecture.components.find((c) => c.id === componentId)?.name ??
    "a removed component"
  );
}
