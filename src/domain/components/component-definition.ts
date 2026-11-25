import type { z } from "zod";
import type { EdgeSettings } from "../model/edge-settings";
import type { StepAction } from "../model/project";
import type { RandomSource } from "../random/random-source";
import type { ComponentBehavior, RequestSettings } from "./component-behavior";
import type { RejectionReasons } from "./error-kind";
import type { SdkRetryDefaults } from "./sdk-retry-defaults";

/** What a definition gets from the engine when it builds a component. */
export interface BuildContext {
  /** The run's seeded randomness; service times are sampled from it. */
  readonly random: RandomSource;
}

/**
 * The request settings each action takes: a strict Zod object schema whose
 * every field has a `.default()`, so parsing `{}` gives all the defaults
 * (ADR-0024). An action left out takes none.
 */
export type RequestSettingsSchemas = Readonly<
  Partial<Record<StepAction, z.ZodType<RequestSettings>>>
>;

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
  /**
   * The settings of a new edge from a component of this type: its latency,
   * timeout, and retry policy (UX design §5). The caller's type decides
   * them, since how long a caller waits is the caller's setting. Must pass
   * `edgeSettingsSchema`.
   */
  readonly edgeDefaults: EdgeSettings;
  /**
   * How its service's AWS SDK client retries, where it differs from the
   * SDKs' standard mode: the attempts and the base delay after a transient
   * error that the AWS SDK standard preset uses on an edge into this type
   * (ADR-0025 decision 3.3). Left out by a type whose clients use the
   * standard values. The contract checks it's in range.
   */
  readonly sdkRetryDefaults?: SdkRetryDefaults;
  /** Step actions this type accepts, e.g. `["read", "write"]`. */
  readonly actions: readonly StepAction[];
  /**
   * The settings a step may give each of `actions`, for a request whose
   * cost or time depends on the call rather than the component: a
   * DynamoDB read's item size, an S3 object's size (ADR-0024). Left out by
   * a type whose actions take none. `arrive` gets them parsed.
   */
  readonly requestSettings?: RequestSettingsSchemas;
  /**
   * True for queue-like types that run the `async` step of the requests they
   * accept, using `dispatched` effects. Only these may be the target of a
   * step that has `async` work.
   */
  readonly deliversAsync: boolean;
  /**
   * Every `reason` this type's behavior may put on a `rejected` effect,
   * each with its error kind, e.g. `{ "too-many-connections": "transient" }`;
   * empty if it never rejects. The set is closed: the contract fails a
   * rejection whose reason isn't a key. It includes the reasons the type's
   * limits declare in `whenFull`, and any that no limit explains, such as a
   * failed validation. Never `timeout`, which the engine reserves
   * (ADR-0016). The engine never retries a `non-retryable` one (ADR-0025).
   */
  readonly rejectionReasons: RejectionReasons;
  /** Builds fresh run-time state. Called once per component per run. */
  build<T>(config: Config, context: BuildContext): ComponentBehavior<T>;
}
