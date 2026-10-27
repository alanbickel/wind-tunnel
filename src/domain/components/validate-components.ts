import type { Component, Project } from "../model/project";
import type { IssuePath, ValidationIssue } from "../model/validation-issue";
import type { ComponentRegistry } from "./component-registry";

/**
 * Checks the architecture's rules that depend on component types, using the
 * registry: every component has a known type and a valid config, and no two
 * components of one type share a name.
 *
 * Complements `validateArchitecture`, which checks the type-independent
 * rules. The type-dependent rules for steps are run checks
 * (`findStepIssues`).
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
  checkUniqueNames(components, { registry, issues });

  return issues;
}

interface ComponentContext {
  readonly registry: ComponentRegistry;
  readonly issues: ValidationIssue[];
}

/** A component and where it is in the project. */
interface ComponentInput {
  readonly component: Component;
  readonly path: IssuePath;
}

/** The component's type is registered, and its config passes the type's checks. */
function checkComponent(at: ComponentInput, context: ComponentContext): void {
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

/**
 * A name is unique among its type's components: a Lambda and a DynamoDB
 * table may both be "orders", two Lambdas may not. Reports the second and
 * later; a component of an unknown type is reported by `checkComponent`.
 */
function checkUniqueNames(
  components: readonly Component[],
  { registry, issues }: ComponentContext,
): void {
  const namesByType = new Map<string, Set<string>>();
  components.forEach((component, index) => {
    const names = namesByType.get(component.type) ?? new Set<string>();
    namesByType.set(component.type, names);
    const type = registry.get(component.type);
    if (type !== undefined && names.has(component.name)) {
      issues.push({
        path: ["architecture", "components", index, "name"],
        message: `Another ${type.displayName} component already uses this name. Please choose another name.`,
      });
    }
    names.add(component.name);
  });
}
