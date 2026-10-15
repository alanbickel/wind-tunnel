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

/** Any failed attempt is retried: a rejection, a timeout, or an error from further down. */
export interface RetryPolicy {
  /** Total attempts, including the first. 1 means no retries. */
  readonly maxAttempts: number;
  readonly backoff: BackoffStrategy;
  readonly baseDelayMs: number;
}

/** A connection that calls travel along, from caller to callee. */
export interface Edge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** One-way network delay. A call pays it twice: there and back. */
  readonly latencyMs: number;
  /** How long the caller waits for each attempt, counted from sending it. */
  readonly timeoutMs: number;
  readonly retry: RetryPolicy;
}

export interface Architecture {
  readonly components: readonly Component[];
  readonly edges: readonly Edge[];
}

export type StepAction = "invoke" | "read" | "write" | "enqueue";

/**
 * One step of a workflow: a call to a component. Nested `calls` are made in
 * order while this step holds its resources (design §3.3).
 */
export interface Step {
  readonly componentId: string;
  readonly action: StepAction;
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
