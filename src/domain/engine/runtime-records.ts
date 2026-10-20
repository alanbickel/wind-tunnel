import type { ComponentBehavior } from "../components/component-behavior";
import type { Edge, Step } from "../model/project";
import type { Failure } from "./simulation-events";

// The records the engine creates as a run goes. Plain state, no behavior:
// a user request makes calls, a call makes attempts, and an attempt becomes
// a visit at its target component.

/** A component in a run: its behavior, and its peaks for the metrics ticks. */
export interface RuntimeComponent {
  readonly id: string;
  readonly behavior: ComponentBehavior<Visit>;
  /** Highest values since the last tick. */
  peakInProgress: number;
  peakQueueDepth: number;
  /**
   * Highest use since the last tick of each of `behavior.limits`, by index:
   * slots held, or tokens drawn out of a full bucket.
   */
  readonly limitPeaks: number[];
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
