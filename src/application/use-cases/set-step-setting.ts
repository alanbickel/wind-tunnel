import type { ComponentRegistry } from "../../domain/components/component-registry";
import {
  setStepSetting,
  type StepSettingChange,
} from "../edits/step-setting-edits";
import type { ProjectRecord } from "../ports/project-record";

export interface SetStepSettingDependencies {
  /** Each type's request settings: their defaults and their schemas. */
  readonly registry: ComponentRegistry;
}

/**
 * The edit command for one of a step's request settings, over the
 * registered types (ADR-0024): the UI can't reach the registry, so it runs
 * `setStepSetting` through this. Like any command, it's a function from
 * record to record: the screen saves it as one undo step.
 */
export class SetStepSetting {
  private readonly deps: SetStepSettingDependencies;

  constructor(deps: SetStepSettingDependencies) {
    this.deps = deps;
  }

  execute(record: ProjectRecord, change: StepSettingChange): ProjectRecord {
    return setStepSetting(record, { ...change, registry: this.deps.registry });
  }
}
