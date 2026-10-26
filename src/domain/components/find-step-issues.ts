import type { Component, Edge, Step, Workflow } from "../model/project";
import type { StepIssue } from "../model/run-issue";
import type { IssuePath } from "../model/validation-issue";
import type { ComponentRegistry, ComponentType } from "./component-registry";

/** A workflow and where it is in the project. */
export interface WorkflowInput {
  readonly workflow: Workflow;
  /** E.g. `["workflows", 0]`. */
  readonly path: IssuePath;
}

/** The architecture a workflow's steps are checked against. */
export interface WorkflowContext {
  /** Components by ID. */
  readonly components: ReadonlyMap<string, Component>;
  /** For each component, the components it has an edge to. */
  readonly edgeTargets: EdgeTargets;
  readonly registry: ComponentRegistry;
}

/** For each component, the components it has an edge to. */
export type EdgeTargets = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * A workflow's run issues, at any depth: each step's component exists, a
 * call follows an edge from its caller (and async work one from its
 * queue), the component accepts the step's action, and only an `enqueue`
 * step on a queue-like component has async work. Assumes the architecture
 * passes `findArchitectureIssues`.
 */
export function findStepIssues(
  { workflow, path }: WorkflowInput,
  context: WorkflowContext,
): StepIssue[] {
  const issues: StepIssue[] = [];
  const root = { step: workflow.root, path: [...path, "root"] };
  checkStep({ ...root, callerId: undefined }, { ...context, issues });
  return issues;
}

/** The edge targets of `edges`, for `WorkflowContext`. */
export function edgeTargetsOf(edges: readonly Edge[]): EdgeTargets {
  const targets = new Map<string, Set<string>>();
  for (const { from, to } of edges) {
    targets.set(from, (targets.get(from) ?? new Set<string>()).add(to));
  }
  return targets;
}

/** The walk's state: the architecture, and the issues found so far. */
interface StepContext extends WorkflowContext {
  readonly issues: StepIssue[];
}

/** A step, where it is, and the component that calls it. */
interface StepInput {
  readonly step: Step;
  readonly path: IssuePath;
  /** `undefined` for a workflow's root, which the user calls. */
  readonly callerId: string | undefined;
}

/** A step and the type of the component it calls. */
interface TypedStepInput extends StepInput {
  readonly type: ComponentType;
}

function checkStep(at: StepInput, context: StepContext): void {
  checkTarget(at, context);
  const { step, path } = at;
  step.calls?.forEach((child, index) => {
    const childPath = [...path, "calls", index];
    checkStep(
      { step: child, path: childPath, callerId: step.componentId },
      context,
    );
  });
  checkAsync(at, context);
}

/** The step's component exists, the call to it follows an edge, and its type fits. */
function checkTarget(at: StepInput, context: StepContext): void {
  const { step, path } = at;
  const component = context.components.get(step.componentId);
  if (component === undefined) {
    context.issues.push({
      kind: "unknown-component",
      path: [...path, "componentId"],
      componentId: step.componentId,
    });
    return;
  }
  checkEdge(at, context);
  // The architecture checks report a type the registry doesn't know.
  const type = context.registry.get(component.type);
  if (type !== undefined) checkType({ ...at, type }, context.issues);
}

/** The step's caller has an edge to it. */
function checkEdge(at: StepInput, { edgeTargets, issues }: StepContext): void {
  const { step, path, callerId } = at;
  if (callerId === undefined) return;
  if (edgeTargets.get(callerId)?.has(step.componentId) === true) return;
  issues.push({
    kind: "missing-edge",
    path,
    fromId: callerId,
    toId: step.componentId,
  });
}

/** The step's component accepts its action, and can deliver its async work. */
function checkType(at: TypedStepInput, issues: StepIssue[]): void {
  const { step, path, type } = at;
  const { componentId, action } = step;
  if (!type.actions.includes(action)) {
    issues.push({
      kind: "action-not-accepted",
      path: [...path, "action"],
      componentId,
      action,
      accepted: type.actions,
    });
  }
  if (step.async !== undefined && !type.deliversAsync) {
    const asyncPath = [...path, "async"];
    issues.push({ kind: "async-not-delivered", path: asyncPath, componentId });
  }
}

/** Async work is only on `enqueue`, and the queue calls its consumer along an edge too. */
function checkAsync({ step, path }: StepInput, context: StepContext): void {
  if (step.async === undefined) return;
  const asyncPath = [...path, "async"];
  if (step.action !== "enqueue") {
    const { action } = step;
    context.issues.push({
      kind: "async-not-on-enqueue",
      path: asyncPath,
      action,
    });
  }
  checkStep(
    { step: step.async, path: asyncPath, callerId: step.componentId },
    context,
  );
}
