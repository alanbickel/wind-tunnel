import type { Project, Step, Workflow } from "./project";
import type { IssuePath } from "./validation-issue";

// Walks and rebuilds workflows' call trees: a step's `calls` in order, then
// its `async` work. Use these rather than writing the recursion again.

/** A step and where it is in the project, e.g. `["workflows", 0, "root", "calls", 1]`. */
export interface LocatedStep {
  readonly step: Step;
  readonly path: IssuePath;
}

/** Every step of every workflow, async work included, in tree order. */
export function stepsOf(project: Project): LocatedStep[] {
  return project.workflows.flatMap((workflow, index) =>
    stepsUnder({ step: workflow.root, path: ["workflows", index, "root"] }),
  );
}

/** Every step of one workflow, async work included, in tree order. */
export function stepsOfWorkflow(workflow: Workflow): Step[] {
  return stepsUnder({ step: workflow.root, path: [] }).map(({ step }) => step);
}

/** The step and every step under it, in tree order. */
function stepsUnder(at: LocatedStep): LocatedStep[] {
  const { step, path } = at;
  const calls = (step.calls ?? []).flatMap((child, index) =>
    stepsUnder({ step: child, path: [...path, "calls", index] }),
  );
  const async =
    step.async === undefined
      ? []
      : stepsUnder({ step: step.async, path: [...path, "async"] });
  return [at, ...calls, ...async];
}

/** Changes one step, given the step with its children already changed. */
export type StepChange = (step: Step) => Step;

/**
 * The tree with `change` applied to every step, children first. The tree
 * keeps its shape: `change` sees each step with its rebuilt `calls` and
 * `async`, and shouldn't add or remove them.
 */
export function mapSteps(step: Step, change: StepChange): Step {
  return change({
    ...step,
    ...(step.calls === undefined
      ? {}
      : { calls: step.calls.map((child) => mapSteps(child, change)) }),
    ...(step.async === undefined
      ? {}
      : { async: mapSteps(step.async, change) }),
  });
}
