import type { ComponentRegistry } from "../components/component-registry";
import type { Project, StepAction } from "../model/project";
import type { RandomSource } from "../random/random-source";

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
}

/**
 * What happened during a run, reported to the observer as it happens.
 * `requestId` identifies the user request (one workflow run) that the work
 * belongs to, including its retries and async work.
 */
export type SimulationEvent =
  | WorkflowStartedEvent
  | WorkflowFinishedEvent
  | ArrivedEvent
  | QueuedEvent
  | StartedEvent
  | RejectedEvent
  | FinishedEvent
  | AttemptFailedEvent
  | DispatchedEvent
  | AsyncFinishedEvent
  | TickEvent;

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

export interface ArrivedEvent extends ComponentEventBase {
  readonly kind: "arrived";
  readonly action: StepAction;
}

export interface QueuedEvent extends ComponentEventBase {
  readonly kind: "queued";
}

export interface StartedEvent extends ComponentEventBase {
  readonly kind: "started";
  readonly serviceMs: number;
}

export interface RejectedEvent extends ComponentEventBase {
  readonly kind: "rejected";
  readonly reason: string;
}

/** Work at a component ended; `latencyMs` counts from its arrival. */
export interface FinishedEvent extends ComponentEventBase {
  readonly kind: "finished";
  readonly latencyMs: number;
  readonly failure?: Failure;
}

/** One attempt along an edge failed. `retryAtMs` is set if another follows. */
export interface AttemptFailedEvent extends RequestEventBase {
  readonly kind: "attempt-failed";
  readonly edgeId: string;
  readonly attempt: number;
  readonly failure: Failure;
  readonly retryAtMs?: number;
}

export interface DispatchedEvent extends ComponentEventBase {
  readonly kind: "dispatched";
}

/** A delivery of async work ended; `latencyMs` counts from the workflow's start. */
export interface AsyncFinishedEvent extends ComponentEventBase {
  readonly kind: "async-finished";
  readonly latencyMs: number;
  readonly succeeded: boolean;
}

/**
 * A metrics tick (only when `tickMs` is set): every component's state now.
 * Comes before any other event at the same time, so it closes the window of
 * events strictly before `timeMs`. The last tick is at the end of the run and
 * also covers events at exactly that time.
 */
export interface TickEvent {
  readonly kind: "tick";
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
   * Report a `tick` every `tickMs` of simulated time, plus one at the end.
   * Off by default.
   */
  readonly tickMs?: number;
}

export interface SimulationResult {
  readonly eventsProcessed: number;
}
