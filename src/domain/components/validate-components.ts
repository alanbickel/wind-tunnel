import type { Component, Project, Step } from "../model/project";
import type { IssuePath, ValidationIssue } from "../model/validate-project";
import type { ComponentRegistry } from "./component-registry";

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
  const byId = new Map<string, Component>();

  project.architecture.components.forEach((component, index) => {
    byId.set(component.id, component);
    const path = ["architecture", "components", index];
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
  });

  const checkStep = (step: Step, path: IssuePath) => {
    const component = byId.get(step.componentId);
    const type =
      component === undefined ? undefined : registry.get(component.type);
    if (type !== undefined) {
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
    step.calls?.forEach((child, index) => {
      checkStep(child, [...path, "calls", index]);
    });
    if (step.async !== undefined) checkStep(step.async, [...path, "async"]);
  };
  project.workflows.forEach((workflow, index) => {
    checkStep(workflow.root, ["workflows", index, "root"]);
  });

  return issues;
}
