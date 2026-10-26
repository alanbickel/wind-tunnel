import type { StepAction } from "../model/project";
import type { ValidationIssue } from "../model/validation-issue";
import type { ComponentBehavior } from "./component-behavior";
import type { BuildContext } from "./component-definition";

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
  /** Every reason the type may reject with; see `ComponentDefinition`. */
  readonly rejectionReasons: readonly string[];
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
export interface ComponentRegistry {
  /** The type registered as `type`, or `undefined` if there isn't one. */
  get(type: string): ComponentType | undefined;
  /** All registered types, in registration order. */
  list(): ComponentType[];
}
