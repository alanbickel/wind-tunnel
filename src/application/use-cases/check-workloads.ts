import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { Project } from "../../domain/model/project";
import {
  workloadRunChecks,
  type WorkloadRunChecks,
} from "../run-checks/workload-run-checks";

export interface CheckWorkloadsDependencies {
  /** Each type's accepted actions, and display names for messages. */
  readonly registry: ComponentRegistry;
}

/** The project whose workloads to check. */
export interface CheckWorkloadsInput {
  /** An opened project, so its architecture is valid. */
  readonly project: Project;
}

/**
 * Which of the project's workloads can run, and why not, for the run
 * controls (UX design §4.3, "Where issues show").
 */
export class CheckWorkloads {
  private readonly deps: CheckWorkloadsDependencies;

  constructor(deps: CheckWorkloadsDependencies) {
    this.deps = deps;
  }

  execute({ project }: CheckWorkloadsInput): WorkloadRunChecks {
    return workloadRunChecks({ project, registry: this.deps.registry });
  }
}
