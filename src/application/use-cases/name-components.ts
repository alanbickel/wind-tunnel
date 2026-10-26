import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { Project } from "../../domain/model/project";
import {
  componentNames,
  type ComponentNames,
} from "../run-analysis/component-names";

export interface NameComponentsDependencies {
  /** Each type's display name, for components of two types with one name. */
  readonly registry: ComponentRegistry;
}

/** The project whose components to name. */
export interface NameComponentsInput {
  readonly project: Project;
}

/**
 * How the project's components are shown in findings: by name, with the
 * type where two types share the name (UX design §5).
 */
export class NameComponents {
  private readonly deps: NameComponentsDependencies;

  constructor(deps: NameComponentsDependencies) {
    this.deps = deps;
  }

  execute({ project }: NameComponentsInput): ComponentNames {
    return componentNames(project, this.deps.registry);
  }
}
