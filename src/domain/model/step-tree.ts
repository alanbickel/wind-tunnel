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

/**
 * The step a path into the project names, e.g. `["workflows", 0, "root",
 * "calls", 1]`, following `calls` and `async` as far as the path goes; a
 * path that goes on into one of the step's fields, such as `componentId`,
 * names that step. Undefined if the path doesn't lead to a step.
 */
export function stepAt(project: Project, path: IssuePath): Step | undefined {
  const [workflows, index, root, ...rest] = path;
  if (workflows !== "workflows" || root !== "root") return undefined;
  const workflow = typeof index === "number" && project.workflows[index];
  return workflow ? stepAlong(workflow.root, rest) : undefined;
}

/** The step `path` leads to from `step`, or undefined for a call it doesn't have. */
function stepAlong(step: Step, path: IssuePath): Step | undefined {
  const [key, index] = path;
  if (key === "async" && step.async !== undefined) {
    return stepAlong(step.async, path.slice(1));
  }
  if (key !== "calls") return step;
  const child = typeof index === "number" ? step.calls?.[index] : undefined;
  return child && stepAlong(child, path.slice(2));
}

/** One step calling another: a nested call, or a queue delivering its async work. */
export interface StepLink {
  readonly caller: Step;
  readonly callee: Step;
}

/**
 * Every call one of the workflow's steps makes to another, async work
 * included, in tree order. The root step has no caller: the user calls it.
 */
export function stepLinksOf(workflow: Workflow): StepLink[] {
  return linksUnder(workflow.root);
}

/** Every caller and callee pair under the step. */
function linksUnder(step: Step): StepLink[] {
  const callees = [...(step.calls ?? []), ...(step.async ? [step.async] : [])];
  return callees.flatMap((callee) => [
    { caller: step, callee },
    ...linksUnder(callee),
  ]);
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
