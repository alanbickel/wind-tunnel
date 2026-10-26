import type { Project } from "../model/project";
import { validateArchitecture } from "../model/validate-architecture";
import type { ValidationIssue } from "../model/validation-issue";
import type { ComponentRegistry } from "./component-registry";
import { validateComponents } from "./validate-components";

/**
 * Every check a project's architecture must pass to be saved or opened
 * (ADR-0019, decision 2): `validateArchitecture`, then `validateComponents`.
 * Empty when the architecture is valid. Its workflows and workloads may
 * still have run issues (`findRunIssues`), which stop only a run.
 */
export function findArchitectureIssues(
  project: Project,
  registry: ComponentRegistry,
): readonly ValidationIssue[] {
  return [
    ...validateArchitecture(project),
    ...validateComponents(project, registry),
  ];
}
