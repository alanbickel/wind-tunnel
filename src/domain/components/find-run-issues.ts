import { findWorkloadIssues } from "../model/find-workload-issues";
import type { Project } from "../model/project";
import type { StepIssue, WorkloadIssue } from "../model/run-issue";
import type { ComponentRegistry } from "./component-registry";
import { edgeTargetsOf, findStepIssues } from "./find-step-issues";

/** A project's run issues, by what they belong to. */
export interface RunIssues {
  /** Each workflow's step issues, by workflow ID; empty for a sound one. */
  readonly workflows: ReadonlyMap<string, readonly StepIssue[]>;
  /** Each workload's own issues, by workload ID; empty for a sound one. */
  readonly workloads: ReadonlyMap<string, readonly WorkloadIssue[]>;
}

/**
 * The problems in a project's workflows and workloads that stop a run but
 * not a save (ADR-0019, decision 2). A workload can run when it has none
 * and nor do the workflows in its mix; `application/run-checks/` puts the
 * two together. Assumes the architecture passes `findArchitectureIssues`.
 */
export function findRunIssues(
  project: Project,
  registry: ComponentRegistry,
): RunIssues {
  const { components, edges } = project.architecture;
  const context = {
    components: new Map(components.map((c) => [c.id, c])),
    edgeTargets: edgeTargetsOf(edges),
    registry,
  };
  const workflows = project.workflows.map((workflow, index) => {
    const at = { workflow, path: ["workflows", index] };
    return [workflow.id, findStepIssues(at, context)] as const;
  });
  const workflowIds = new Set(project.workflows.map((w) => w.id));
  const workloads = project.workloads.map((workload, index) => {
    const at = { workload, path: ["workloads", index] };
    return [workload.id, findWorkloadIssues(at, { workflowIds })] as const;
  });
  return { workflows: new Map(workflows), workloads: new Map(workloads) };
}
