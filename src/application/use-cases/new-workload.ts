import type { AddWorkloadInput } from "../edits/workload-edits";
import type { IdGenerator } from "../ports/id-generator";

export interface NewWorkloadDependencies {
  /** The new workload's id. */
  readonly ids: IdGenerator;
}

/**
 * What `addWorkload` needs to add a workload: a new id. The command names
 * the workload and gives it the editor's defaults, from the record it's
 * applied to, so the name is free in the project as it is then.
 */
export class NewWorkload {
  private readonly deps: NewWorkloadDependencies;

  constructor(deps: NewWorkloadDependencies) {
    this.deps = deps;
  }

  execute(): AddWorkloadInput {
    return { workloadId: this.deps.ids.newId() };
  }
}
