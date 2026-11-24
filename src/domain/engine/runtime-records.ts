import type {
  ComponentBehavior,
  RequestSettings,
} from "../components/component-behavior";
import type { ErrorKind, RejectionReasons } from "../components/error-kind";
import type { Edge, Step } from "../model/project";
import type { Failure } from "./simulation-events";

// The records the engine creates as a run goes. Plain state, no behavior:
// a user request makes calls, a call makes attempts, and an attempt becomes
// a visit at its target component.

/**
 * A component in a run: its behavior, its type's rejection reasons, and its
 * peaks for the metrics ticks.
 */
export interface RuntimeComponent {
  readonly id: string;
  readonly behavior: ComponentBehavior<Visit>;
  /** Its type's reasons, each with the error kind a rejection gets. */
  readonly rejectionReasons: RejectionReasons;
  /** Highest values since the last tick. */
  peakInProgress: number;
  peakQueueDepth: number;
  /**
   * Highest use since the last tick of each of `behavior.limits`, by index:
   * slots held, or tokens drawn out of a full bucket.
   */
  readonly limitPeaks: number[];
}

/**
 * A failed attempt's answer: its cause, and the error kind its caller's
 * retry policy sees. The kind travels beside the cause, not in it, since a
 * failure from further down keeps its cause but changes its kind at each
 * component it passes through (ADR-0025 decision 1.4).
 */
export interface AttemptFailure {
  readonly failure: Failure;
  readonly kind: ErrorKind;
}

/** One user request: a single run of a workflow. */
export interface UserRequest {
  readonly id: number;
  readonly workflowId: string;
  readonly startMs: number;
}

/**
 * A call from a caller to a step's component: one or more attempts, as the
 * edge's retry policy allows. The user's call to a workflow's root has no
 * edge: no latency, no timeout, and no retries.
 */
export interface Call {
  readonly step: Step;
  /** The step's request settings, parsed, as `arrive` gets them. */
  readonly settings: RequestSettings;
  readonly target: RuntimeComponent;
  readonly edge: Edge | undefined;
  readonly request: UserRequest;
  attempts: number;
  /** Called once, when the call succeeds or its last attempt fails. */
  readonly onSettled: (failure: Failure | undefined) => void;
}

export interface Attempt {
  readonly call: Call;
  readonly number: number;
  /** Answered or timed out. A response after that is ignored. */
  settled: boolean;
}

/** One attempt's stay at its target. This is the token components hold. */
export interface Visit {
  readonly attempt: Attempt;
  readonly arrivedMs: number;
  /** Index of the next nested call to make. */
  nextCall: number;
}
