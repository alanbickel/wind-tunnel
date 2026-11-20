import { z } from "zod";
import type { StepAction } from "../model/project";
import type { ValidationIssue } from "../model/validation-issue";
import { issuesFromZod } from "../model/zod-issues";
import type { RequestSettings } from "./component-behavior";
import type {
  ComponentDefinition,
  RequestSettingsSchemas,
} from "./component-definition";
import type { ComponentRegistry, ComponentType } from "./component-registry";

/** What an action that takes no request settings accepts: none at all. */
const NO_SETTINGS: z.ZodType<RequestSettings> = z.strictObject({});

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
    const settingsFor = settingsSchemaFor(definition.requestSettings ?? {});
    this.byType.set(definition.type, {
      type: definition.type,
      displayName: definition.displayName,
      actions: definition.actions,
      deliversAsync: definition.deliversAsync,
      rejectionReasons: definition.rejectionReasons,
      defaultConfig: definition.defaultConfig,
      edgeDefaults: definition.edgeDefaults,
      checkConfig: (config) => issuesOf(schema.safeParse(config)),
      checkSettings: (action, settings) =>
        issuesOf(settingsFor(action).safeParse(settings ?? {})),
      parseSettings: (action, settings) =>
        settingsFor(action).parse(settings ?? {}),
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

/** Each action's schema, or `NO_SETTINGS` for an action that takes none. */
function settingsSchemaFor(
  schemas: RequestSettingsSchemas,
): (action: StepAction) => z.ZodType<RequestSettings> {
  return (action) => schemas[action] ?? NO_SETTINGS;
}

/** A parse's issues; none if it passed. */
function issuesOf(result: z.ZodSafeParseResult<unknown>): ValidationIssue[] {
  return result.success ? [] : issuesFromZod(result.error);
}
