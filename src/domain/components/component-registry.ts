import type { StepAction } from "../model/project";
import type { ValidationIssue } from "../model/validate-project";
import type { ComponentBehavior } from "./component-behavior";
import type { BuildContext, ComponentDefinition } from "./component-definition";

/**
 * A registered definition with its config type hidden, so definitions with
 * different config types can live in one registry. Configs go in as
 * `unknown` and are parsed by the definition's schema before use.
 */
export interface ComponentType {
  readonly type: string;
  readonly displayName: string;
  readonly actions: readonly StepAction[];
  readonly deliversAsync: boolean;
  readonly defaultConfig: unknown;
  /** Problems with `config`, with paths relative to the config. */
  checkConfig(config: unknown): ValidationIssue[];
  /**
   * Parses `config` (applying schema defaults) and builds the behavior.
   * Throws if the config is invalid, so check it when the project loads.
   */
  build<T>(config: unknown, context: BuildContext): ComponentBehavior<T>;
}

/** The component types the engine can simulate, looked up by `type`. */
export class ComponentRegistry {
  private readonly byType = new Map<string, ComponentType>();

  /** Adds a definition. Each `type` can be registered once. */
  register<Config>(definition: ComponentDefinition<Config>): this {
    if (this.byType.has(definition.type)) {
      throw new Error(
        `Component type "${definition.type}" is already registered`,
      );
    }
    const schema = definition.configSchema;
    this.byType.set(definition.type, {
      type: definition.type,
      displayName: definition.displayName,
      actions: definition.actions,
      deliversAsync: definition.deliversAsync,
      defaultConfig: definition.defaultConfig,
      checkConfig(config) {
        const result = schema.safeParse(config);
        if (result.success) return [];
        return result.error.issues.map((issue) => ({
          path: issue.path.map((key) =>
            typeof key === "number" ? key : String(key),
          ),
          message: issue.message,
        }));
      },
      build(config, context) {
        return definition.build(schema.parse(config), context);
      },
    });
    return this;
  }

  get(type: string): ComponentType | undefined {
    return this.byType.get(type);
  }

  /** All registered types, in registration order. */
  list(): ComponentType[] {
    return [...this.byType.values()];
  }
}
