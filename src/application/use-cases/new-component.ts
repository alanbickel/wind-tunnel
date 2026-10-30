import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { AddComponentInput } from "../edits/component-edits";
import type { IdGenerator } from "../ports/id-generator";

export interface NewComponentDependencies {
  /** Each type's default settings. */
  readonly registry: ComponentRegistry;
  /** The new component's id. */
  readonly ids: IdGenerator;
}

/** The type of component to add. */
export interface NewComponentInput {
  readonly type: string;
}

/**
 * What `addComponent` needs to add a component of a type: a new id and
 * the type's default settings (UX design §5). Undefined if the registry
 * has no such type. The command names the component, from the record it's
 * applied to, so the name is free in the project as it is then.
 */
export class NewComponent {
  private readonly deps: NewComponentDependencies;

  constructor(deps: NewComponentDependencies) {
    this.deps = deps;
  }

  execute({ type }: NewComponentInput): AddComponentInput | undefined {
    const { registry, ids } = this.deps;
    const defaultConfig = registry.get(type)?.defaultConfig;
    if (!isConfig(defaultConfig)) return undefined;
    return { componentId: ids.newId(), type, defaultConfig };
  }
}

/** Every definition's `defaultConfig` is an object of settings. */
function isConfig(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
