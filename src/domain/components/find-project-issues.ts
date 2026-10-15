import type { Project } from "../model/project";
import {
  validateProject,
  type ValidationIssue,
} from "../model/validate-project";
import type { ComponentRegistry } from "./component-registry";
import { validateComponents } from "./validate-components";

/**
 * Every check a project must pass before it runs: `validateProject`, then
 * `validateComponents`. Returns the issues from the first one that finds
 * any, because the component checks assume the project-wide rules hold.
 * Empty when the project is valid.
 */
export function findProjectIssues(
  project: Project,
  registry: ComponentRegistry,
): readonly ValidationIssue[] {
  const issues = validateProject(project);
  if (issues.length > 0) return issues;
  return validateComponents(project, registry);
}
