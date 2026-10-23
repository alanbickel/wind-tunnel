import type {
  ConcurrencyLimitGauge,
  RefuseWhenFull,
} from "../components/component-behavior";
import type { ComponentRegistry } from "../components/component-registry";
import type { Project, StepAction } from "../model/project";
import type { RandomSource } from "../random/random-source";

/**
 * The reason on a failure the engine makes when a caller stops waiting. No
 * component may reject with it (ADR-0016).
 */
export const TIMEOUT_REASON = "timeout";

/** Why a call failed, and where. */
export interface Failure {
  /** The component that rejected the request, or that the caller gave up on. */
  readonly componentId: string;
  /** The component's rejection reason (e.g. `"throttled"`), or `"timeout"`. */
  readonly reason: string;
}

/** One component's state at a metrics tick. */
export interface ComponentSample {
  readonly componentId: string;
  readonly inProgress: number;
  readonly queueDepth: number;
  /** Highest values since the previous tick (or the start). */
  readonly peakInProgress: number;
  readonly peakQueueDepth: number;
  /** The component's type-specific values; see `ComponentBehavior`. */
  readonly gauges: Readonly<Record<string, number>>;
  readonly counters: Readonly<Record<string, number>>;
  /** Each of the component's limits, in its order; see `ComponentBehavior`. */
  readonly limits: readonly LimitSample[];
}

/** One of a component's limits at a tick. */
export type LimitSample = ConcurrencyLimitSample | RateLimitSample;

/** A concurrency limit's slots held at the tick, and its peak before it. */
export interface ConcurrencyLimitSample extends ConcurrencyLimitGauge {
  /** Most slots held at once since the previous tick (or the start). */
  readonly peakInUse: number;
}

/** A token bucket at the tick, and its lowest level before it. */
export interface RateLimitSample {
  readonly kind: "rate";
  /** camelCase, unique within the component, e.g. `readUnits`. */
  readonly name: string;
  /** What the bucket does once empty: always a refusal. */
  readonly whenFull: RefuseWhenFull;
  /** Tokens added per second. */
  readonly ratePerSec: number;
  /** Most tokens the bucket holds. */
  readonly burst: number;
  /** Tokens taken since the run began. */
  readonly taken: number;
  /** Tokens missing from a full bucket at the tick: `burst` minus those left. */
  readonly drawnDown: number;
  /** Most tokens missing at once since the previous tick (or the start). */
  readonly peakDrawnDown: number;
}

/**
 * What happened during a run, reported to the observer as it happens.
 * `requestId` identifies the user request (one workflow run) that the work
 * belongs to, including its retries and async work.
 */
export type SimulationEvent =
  | WorkflowStartedEvent
  | WorkflowFinishedEvent
  | ComponentArrivedEvent
  | ComponentQueuedEvent
  | ComponentStartedEvent
  | ComponentRejectedEvent
  | ComponentFinishedEvent
  | EdgeAttemptFailedEvent
  | ComponentDispatchedEvent
  | ComponentAsyncFinishedEvent
  | MetricsTickEvent;

/** Fields every event about one user request has. */
export interface RequestEventBase {
  readonly timeMs: number;
  readonly requestId: number;
}

/** Fields every event about a request at one component has. */
export interface ComponentEventBase extends RequestEventBase {
  readonly componentId: string;
}

export interface WorkflowStartedEvent extends RequestEventBase {
  readonly kind: "workflow-started";
  readonly workflowId: string;
}

/** The user got an answer. Async work may still be pending. */
export interface WorkflowFinishedEvent extends RequestEventBase {
  readonly kind: "workflow-finished";
  readonly workflowId: string;
  readonly latencyMs: number;
  readonly failure?: Failure;
}

export interface ComponentArrivedEvent extends ComponentEventBase {
  readonly kind: "component-arrived";
  readonly action: StepAction;
}

export interface ComponentQueuedEvent extends ComponentEventBase {
  readonly kind: "component-queued";
}

export interface ComponentStartedEvent extends ComponentEventBase {
  readonly kind: "component-started";
  readonly serviceMs: number;
}

export interface ComponentRejectedEvent extends ComponentEventBase {
  readonly kind: "component-rejected";
  readonly reason: string;
}

/** Work at a component ended; `latencyMs` counts from its arrival. */
export interface ComponentFinishedEvent extends ComponentEventBase {
  readonly kind: "component-finished";
  readonly latencyMs: number;
  readonly failure?: Failure;
}

/** One attempt along an edge failed. `retryAtMs` is set if another follows. */
export interface EdgeAttemptFailedEvent extends RequestEventBase {
  readonly kind: "edge-attempt-failed";
  readonly edgeId: string;
  readonly attempt: number;
  readonly failure: Failure;
  readonly retryAtMs?: number;
}

export interface ComponentDispatchedEvent extends ComponentEventBase {
  readonly kind: "component-dispatched";
}

/**
 * A delivery of async work ended; `latencyMs` counts from the workflow's
 * start. `failure` is set if the delivery failed, with the cause that
 * ended it (ADR-0017).
 */
export interface ComponentAsyncFinishedEvent extends ComponentEventBase {
  readonly kind: "component-async-finished";
  readonly latencyMs: number;
  readonly failure?: Failure;
}

/**
 * A metrics tick (only when `tickMs` is set): every component's state now.
 * Comes before any other event at the same time, so it closes the window of
 * events strictly before `timeMs`. The last tick is at the end of the run and
 * also covers events at exactly that time.
 */
export interface MetricsTickEvent {
  readonly kind: "metrics-tick";
  readonly timeMs: number;
  readonly components: readonly ComponentSample[];
}

/** The random stream for a name such as `"arrivals"`. */
export type RandomStreams = (stream: string) => RandomSource;

export interface SimulationInput {
  /** A project that passed `validateProject` and `validateComponents`. */
  readonly project: Project;
  readonly workloadId: string;
  readonly registry: ComponentRegistry;
  readonly observer?: (event: SimulationEvent) => void;
  /**
   * The random stream for a name such as `"arrivals"` or
   * `"component:orders-db"`. Defaults to streams seeded from the workload's
   * seed with `deriveSeed`; tests can pass scripted sources.
   */
  readonly random?: RandomStreams;
  /** Stop at this simulated time. Defaults to the workload's duration. */
  readonly untilMs?: number;
  /**
   * Report a `metrics-tick` every `tickMs` of simulated time, plus one at the end.
   * Off by default.
   */
  readonly tickMs?: number;
}

export interface SimulationResult {
  readonly eventsProcessed: number;
}
