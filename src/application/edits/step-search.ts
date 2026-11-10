import type { Step, Workflow } from "../../domain/model/project";

// The edit commands find a step by its id in both trees of a workflow: its
// `calls`, and an `enqueue` step's `async` work (ADR-0021 decision 2).

/** A step's children: its calls in order, then its async root if it has one. */
function childrenOf(step: Step): Step[] {
  return [...(step.calls ?? []), ...(step.async ? [step.async] : [])];
}

/**
 * The step with this id, in the main tree or the async work, at any depth.
 * Undefined if the workflow has none.
 */
export function findStep(workflow: Workflow, stepId: string): Step | undefined {
  return stepUnder(workflow.root, stepId);
}

function stepUnder(step: Step, stepId: string): Step | undefined {
  if (step.id === stepId) return step;
  return childrenOf(step)
    .map((child) => stepUnder(child, stepId))
    .find(Boolean);
}

/**
 * The step that holds `stepId`, whichever child it is: its caller for a
 * call, and the queue for an async root. Undefined for the workflow's root,
 * which nothing holds, and for a step the workflow doesn't have.
 */
export function holderOf(workflow: Workflow, stepId: string): Step | undefined {
  return holderUnder(workflow.root, stepId);
}

function holderUnder(step: Step, stepId: string): Step | undefined {
  const children = childrenOf(step);
  if (children.some((child) => child.id === stepId)) return step;
  return children.map((child) => holderUnder(child, stepId)).find(Boolean);
}
