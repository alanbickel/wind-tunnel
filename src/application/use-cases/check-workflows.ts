import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { Project } from "../../domain/model/project";
import {
  workflowRunChecks,
  type WorkflowRunChecks,
} from "../run-checks/workflow-run-checks";

export interface CheckWorkflowsDependencies {
  /** Each type's accepted actions, and display names for messages. */
  readonly registry: ComponentRegistry;
}

/** The project whose workflows to check. */
export interface CheckWorkflowsInput {
  /** An opened project, so its architecture is valid. */
  readonly project: Project;
}

/**
 * Each of the project's workflows' run issues, for the workflows list's
 * problem counts (UX design §2.5 step 7).
 */
export class CheckWorkflows {
  private readonly deps: CheckWorkflowsDependencies;

  constructor(deps: CheckWorkflowsDependencies) {
    this.deps = deps;
  }

  execute({ project }: CheckWorkflowsInput): WorkflowRunChecks {
    return workflowRunChecks({ project, registry: this.deps.registry });
  }
}
