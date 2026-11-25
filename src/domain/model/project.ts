// Domain entities (MVP design §3). Plain, readonly data: no behavior, no
// persistence details. The project document (ADR-0004) is mapped to these
// types after it has been parsed; layout and timestamps stay in the document.

/** One cloud service instance in the model, e.g. a Lambda function. */
export interface Component {
  readonly id: string;
  /** Component definition type, e.g. "lambda". */
  readonly type: string;
  readonly name: string;
  /** Type-specific settings, validated by the component definition. */
  readonly config: Readonly<Record<string, unknown>>;
}

/** How the wait between attempts grows; see `backoffMs` in the engine. */
export type BackoffStrategy = "none" | "exponential" | "exponential-jitter";

/**
 * A custom retry policy, with its own values: one base delay for every
 * retryable failure (ADR-0025 decision 2.3). A failure that isn't
 * retryable is never retried.
 */
export interface RetryPolicy {
  /** Total attempts, including the first. 1 means no retries. */
  readonly maxAttempts: number;
  readonly backoff: BackoffStrategy;
  readonly baseDelayMs: number;
}

/** The one retry preset: the AWS SDKs' standard mode (ADR-0025 decision 3). */
export type RetryPresetName = "aws-sdk-standard";

/**
 * Retries as an AWS SDK client in standard mode would, stored by name and
 * resolved against the edge's target when a run is built (`resolveRetry`).
 */
export interface RetryPreset {
  readonly preset: RetryPresetName;
  /** Overrides the target type's attempts, and the SDK's 3. */
  readonly maxAttempts?: number;
}

/** An edge's retries: a custom policy, or the AWS SDK standard preset. */
export type EdgeRetry = RetryPolicy | RetryPreset;

/** A connection that calls travel along, from caller to callee. */
export interface Edge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** One-way network delay. A call pays it twice: there and back. */
  readonly latencyMs: number;
  /** How long the caller waits for each attempt, counted from sending it. */
  readonly timeoutMs: number;
  readonly retry: EdgeRetry;
}

export interface Architecture {
  readonly components: readonly Component[];
  readonly edges: readonly Edge[];
}

export type StepAction = "invoke" | "read" | "write" | "enqueue";

/**
 * A step's request settings as it stores them: only the values set for this
 * step, each differing from the type's default (ADR-0024). The called type
 * checks them, and fills in the rest when a run starts.
 */
export type StepSettings = Readonly<Record<string, unknown>>;

/**
 * One step of a workflow: a call to a component. Nested `calls` are made in
 * order while this step holds its resources (design §3.3).
 */
export interface Step {
  /**
   * Unique within the project; never shown. Identity, not content: the
   * engine ignores it (ADR-0020).
   */
  readonly id: string;
  readonly componentId: string;
  readonly action: StepAction;
  /**
   * The request settings this step sets for its action; absent when it
   * sets none. They belong to the action of the component's type, so a
   * change of either drops them (ADR-0024).
   */
  readonly settings?: StepSettings;
  readonly calls?: readonly Step[];
  /** Only on `enqueue`: work done later, when a consumer takes the message. */
  readonly async?: Step;
}

/** What one user request does, as a call tree. */
export interface Workflow {
  readonly id: string;
  readonly name: string;
  readonly root: Step;
}

export interface MixEntry {
  readonly workflowId: string;
  /** Relative weight; the shares are weight / sum of weights. */
  readonly weight: number;
}

/** Target request rate at a point in time; linear between points. */
export interface ProfilePoint {
  readonly atMs: number;
  readonly requestsPerSec: number;
}

/** Which workflows run, in what mix, at what rate over time (design §3.4). */
export interface Workload {
  readonly id: string;
  readonly name: string;
  readonly durationMs: number;
  readonly seed: number;
  readonly mix: readonly MixEntry[];
  readonly profile: readonly ProfilePoint[];
}

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly architecture: Architecture;
  readonly workflows: readonly Workflow[];
  readonly workloads: readonly Workload[];
}
