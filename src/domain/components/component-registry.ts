import type { EdgeSettings } from "../model/edge-settings";
import type { StepAction, StepSettings } from "../model/project";
import type { ValidationIssue } from "../model/validation-issue";
import type { ComponentBehavior, RequestSettings } from "./component-behavior";
import type { BuildContext } from "./component-definition";
import type { RejectionReasons } from "./error-kind";
import type { SdkRetryDefaults } from "./sdk-retry-defaults";

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
  /** Every reason the type may reject with, and its kind; see `ComponentDefinition`. */
  readonly rejectionReasons: RejectionReasons;
  readonly defaultConfig: unknown;
  /** The settings of a new edge from a component of this type. */
  readonly edgeDefaults: EdgeSettings;
  /** How its SDK client's retries differ from standard; see `ComponentDefinition`. */
  readonly sdkRetryDefaults: SdkRetryDefaults | undefined;
  /** Problems with `config`, with paths relative to the config. */
  checkConfig(config: unknown): ValidationIssue[];
  /**
   * Problems with a step's request `settings` for `action`, as the step
   * stores them, with paths relative to the settings. An action that takes
   * none accepts only none, or `{}`.
   */
  checkSettings(
    action: StepAction,
    settings: StepSettings | undefined,
  ): ValidationIssue[];
  /**
   * A step's request settings for `action`, with the defaults filled in,
   * as `arrive` gets them; `{}` for an action that takes none. Throws if
   * they're invalid, so check them with `checkSettings` first.
   */
  parseSettings(
    action: StepAction,
    settings: StepSettings | undefined,
  ): RequestSettings;
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
