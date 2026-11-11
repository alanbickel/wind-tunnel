import type { Edge, Project } from "../../domain/model/project";
import {
  stepLinksOf,
  stepsOfWorkflow,
  type StepLink,
} from "../../domain/model/step-tree";
import type { StepCall } from "./details";

/**
 * The names of the workflows with a step that calls the component, its
 * async work included, in project order (UX design §5, "what calls a
 * component").
 */
export function workflowsCalling(
  project: Project,
  componentId: string,
): string[] {
  return project.workflows
    .filter((workflow) =>
      stepsOfWorkflow(workflow).some((s) => s.componentId === componentId),
    )
    .map((workflow) => workflow.name);
}

/** How many steps call the component, in every workflow, async work included. */
export function stepsCalling(project: Project, componentId: string): number {
  return project.workflows
    .flatMap(stepsOfWorkflow)
    .filter((step) => step.componentId === componentId).length;
}

/**
 * The steps that call along the edge: each step on the edge's target whose
 * caller is on its source, once per workflow and action, in project order.
 * A queue's async work counts as called by the queue's step.
 */
export function stepsAlong(project: Project, edge: Edge): StepCall[] {
  const found = project.workflows.flatMap((workflow) =>
    stepLinksOf(workflow)
      .filter(({ caller, callee }) => isAlong(edge, { caller, callee }))
      .map(({ callee }) => ({
        workflowName: workflow.name,
        action: callee.action,
      })),
  );
  return found.filter(
    (call, i) =>
      found.findIndex(
        (other) =>
          other.workflowName === call.workflowName &&
          other.action === call.action,
      ) === i,
  );
}

/**
 * How many steps call along the edge, in every workflow, a queue's async
 * work included. Unlike `stepsAlong`, each is counted, even two in one
 * workflow with the same action.
 */
export function stepsCallingAlong(project: Project, edge: Edge): number {
  return project.workflows
    .flatMap(stepLinksOf)
    .filter((pair) => isAlong(edge, pair)).length;
}

function isAlong(edge: Edge, { caller, callee }: StepLink): boolean {
  return caller.componentId === edge.from && callee.componentId === edge.to;
}
