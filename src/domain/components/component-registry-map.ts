import { issuesFromZod } from "../model/zod-issues";
import type { ComponentDefinition } from "./component-definition";
import type { ComponentRegistry, ComponentType } from "./component-registry";

/**
 * A `ComponentRegistry` kept in a `Map`. Factories such as
 * `createAwsComponentRegistry` build one with `register`; everything else
 * sees only the read-only `ComponentRegistry`.
 */
export class ComponentRegistryMap implements ComponentRegistry {
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
      rejectionReasons: definition.rejectionReasons,
      defaultConfig: definition.defaultConfig,
      checkConfig(config) {
        const result = schema.safeParse(config);
        if (result.success) return [];
        return issuesFromZod(result.error);
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

  list(): ComponentType[] {
    return [...this.byType.values()];
  }
}
