import type { z } from "zod";
import type { StepAction } from "../model/project";
import type { RandomSource } from "../random/random-source";
import type { ComponentBehavior } from "./component-behavior";

/** What a definition gets from the engine when it builds a component. */
export interface BuildContext {
  /** The run's seeded randomness; service times are sampled from it. */
  readonly random: RandomSource;
}

/**
 * Describes one component type, e.g. "lambda": its config and how to build
 * its run-time behavior (MVP design §3.1). Adding a type means writing a
 * definition and registering it; the engine doesn't change (Open/Closed).
 *
 * Every definition's tests must show that `checkComponentContract` finds no
 * violations.
 */
export interface ComponentDefinition<Config> {
  /** Stored in the project document, e.g. "lambda". Never rename it. */
  readonly type: string;
  /** Shown to users, e.g. "AWS Lambda". */
  readonly displayName: string;
  /** Validates `Component.config` (ADR-0005). */
  readonly configSchema: z.ZodType<Config>;
  /** Config for a newly added component. Must pass `configSchema`. */
  readonly defaultConfig: Config;
  /** Step actions this type accepts, e.g. `["read", "write"]`. */
  readonly actions: readonly StepAction[];
  /**
   * True for queue-like types that run the `async` step of the requests they
   * accept, using `dispatched` effects. Only these may be the target of a
   * step that has `async` work.
   */
  readonly deliversAsync: boolean;
  /**
   * Every `reason` this type's behavior may put on a `rejected` effect,
   * e.g. `["too-many-connections"]`; empty if it never rejects. The list is
   * closed: the contract fails a rejection whose reason isn't on it. It
   * includes the reasons the type's limits declare in `whenFull`, and any
   * that no limit explains, such as a failed validation. Never `timeout`,
   * which the engine reserves (ADR-0016).
   */
  readonly rejectionReasons: readonly string[];
  /** Builds fresh run-time state. Called once per component per run. */
  build<T>(config: Config, context: BuildContext): ComponentBehavior<T>;
}
