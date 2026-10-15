import type { Component, Project, Step } from "../model/project";
import type { IssuePath, ValidationIssue } from "../model/validate-project";
import type { ComponentRegistry, ComponentType } from "./component-registry";

/**
 * Checks the rules that depend on component types, using the registry: every
 * component has a known type and a valid config, every step uses an action
 * its target accepts, and only queue-like components carry `async` work.
 *
 * Complements `validateProject`, which checks the type-independent rules.
 * Steps that target unknown components are skipped here; `validateProject`
 * reports them.
 */
export function validateComponents(
  project: Project,
  registry: ComponentRegistry,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { components } = project.architecture;
  components.forEach((component, index) => {
    const path = ["architecture", "components", index];
    checkComponent({ component, path }, { registry, issues });
  });

  const byId = new Map(components.map((c) => [c.id, c]));
  const context: StepContext = { registry, byId, issues };
  project.workflows.forEach((workflow, index) => {
    checkStep(
      { step: workflow.root, path: ["workflows", index, "root"] },
      context,
    );
  });

  return issues;
}

interface ComponentContext {
  readonly registry: ComponentRegistry;
  readonly issues: ValidationIssue[];
}

/** A component and where it is in the project. */
interface ComponentAt {
  readonly component: Component;
  readonly path: IssuePath;
}

/** The component's type is registered, and its config passes the type's checks. */
function checkComponent(at: ComponentAt, context: ComponentContext): void {
  const { component, path } = at;
  const { registry, issues } = context;
  const type = registry.get(component.type);
  if (type === undefined) {
    issues.push({
      path: [...path, "type"],
      message: `Unknown component type "${component.type}".`,
    });
    return;
  }
  for (const issue of type.checkConfig(component.config)) {
    issues.push({
      path: [...path, "config", ...issue.path],
      message: issue.message,
    });
  }
}

interface StepContext extends ComponentContext {
  /** Components by ID; for duplicate IDs, the last one. */
  readonly byId: ReadonlyMap<string, Component>;
}

/** A step and where it is in the project. */
interface StepAt {
  readonly step: Step;
  readonly path: IssuePath;
}

/** A step and the type of the component it targets. */
interface TypedStepAt extends StepAt {
  readonly type: ComponentType;
}

function checkStep(at: StepAt, context: StepContext): void {
  const { step, path } = at;
  const type = targetType(step, context);
  if (type !== undefined) checkStepType({ ...at, type }, context.issues);
  step.calls?.forEach((child, index) => {
    checkStep({ step: child, path: [...path, "calls", index] }, context);
  });
  if (step.async !== undefined) {
    checkStep({ step: step.async, path: [...path, "async"] }, context);
  }
}

/** The type of the step's component, or `undefined` if either is unknown. */
function targetType(
  step: Step,
  { byId, registry }: StepContext,
): ComponentType | undefined {
  const component = byId.get(step.componentId);
  if (component === undefined) return undefined;
  return registry.get(component.type);
}

/** The target accepts the step's action, and can carry its async work. */
function checkStepType(at: TypedStepAt, issues: ValidationIssue[]): void {
  const { step, path, type } = at;
  if (!type.actions.includes(step.action)) {
    issues.push({
      path: [...path, "action"],
      message: `${type.displayName} "${step.componentId}" doesn't accept "${step.action}"; it accepts ${type.actions.map((a) => `"${a}"`).join(", ")}.`,
    });
  }
  if (step.async !== undefined && !type.deliversAsync) {
    issues.push({
      path: [...path, "async"],
      message: `${type.displayName} "${step.componentId}" can't run async work; only queue-like components can.`,
    });
  }
}
