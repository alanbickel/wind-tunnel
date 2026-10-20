import type { StepAction } from "../model/project";

/**
 * What a component tells the engine after the engine calls it. A component
 * never schedules events or reads a clock itself; it returns effects and the
 * engine turns them into events (ADR-0006).
 *
 * `T` is the engine's request token. Components treat it as opaque: they
 * hold it while a request waits and hand it back in effects.
 */
export type Effect<T> =
  StartedEffect<T> | QueuedEffect<T> | RejectedEffect<T> | DispatchedEffect<T>;

/** `request` begins its work here now; its own work takes `serviceMs`. */
export interface StartedEffect<T> {
  readonly kind: "started";
  readonly request: T;
  readonly serviceMs: number;
}

/** `request` waits inside the component; a later `started` will follow. */
export interface QueuedEffect<T> {
  readonly kind: "queued";
  readonly request: T;
}

/** `request` failed to get in, e.g. `"throttled"` or `"too-many-connections"`. */
export interface RejectedEffect<T> {
  readonly kind: "rejected";
  readonly request: T;
  readonly reason: string;
}

/**
 * Start `request`'s `async` step now (queue-like components only). Sent
 * after the request has finished here, when a consumer takes the message.
 */
export interface DispatchedEffect<T> {
  readonly kind: "dispatched";
  readonly request: T;
}

/** A request arrives at the component. */
export interface ArriveInput<T> {
  readonly request: T;
  /** What the step asks for; one of the definition's `actions`. */
  readonly action: StepAction;
  /** The current simulated time. */
  readonly nowMs: number;
}

/** A started request's service time and nested calls are done. */
export interface FinishInput<T> {
  readonly request: T;
  readonly nowMs: number;
}

/** A dispatched request's `async` work is done. */
export interface DispatchFinishedInput<T> {
  readonly request: T;
  /** False if the async work failed and may need redelivering. */
  readonly succeeded: boolean;
  readonly nowMs: number;
}

/**
 * A limit a component enforces, as a live view: the engine reads it after
 * every call into the component, to find its use and peak for the metrics.
 */
export type LimitGauge = ConcurrencyLimitGauge | RateLimitGauge;

/**
 * Slots held out of a fixed number, e.g. RDS `connections` or Lambda
 * `concurrency`. A full limit queues or rejects the next request.
 */
export interface ConcurrencyLimitGauge {
  readonly kind: "concurrency";
  /** camelCase, unique within the component, and stable across a run. */
  readonly name: string;
  /** Most slots that can be held at once. */
  readonly limit: number;
  /** Slots held now. */
  readonly inUse: number;
}

/**
 * A token bucket, e.g. API Gateway's `requestRate`: each request takes a
 * token, tokens refill at `ratePerSec` up to `burst`, and with less than
 * one token left the next request is rejected.
 */
export interface RateLimitGauge {
  readonly kind: "rate";
  /** camelCase, unique within the component, and stable across a run. */
  readonly name: string;
  /** Tokens added per second. */
  readonly ratePerSec: number;
  /** Most tokens the bucket holds: what can be taken at once after a quiet spell. */
  readonly burst: number;
  /** Tokens taken since the run began. Never decreases. */
  readonly taken: number;
  /**
   * Tokens in the bucket at `nowMs`, between 0 and `burst`. Only reads;
   * `nowMs` is never earlier than the component's last call.
   */
  tokensLeft(nowMs: number): number;
}

/**
 * The run-time state of one component during a simulation, built from a
 * component definition and its config.
 *
 * Lifecycle of a request at a component (ADR-0006):
 *
 * 1. The engine calls `arrive`. The effects include exactly one outcome for
 *    that request: `started`, `queued`, or `rejected`.
 * 2. A `queued` request gets its `started` from a later `finish` or
 *    `dispatchFinished` call, once something frees up.
 * 3. After a `started` request's service time and nested calls are done (or
 *    have failed), the engine calls `finish`, which frees its resources.
 *
 * Every accepted request is started exactly once and finished exactly once.
 * Nothing is cancelled: a caller that times out stops waiting, but the work
 * here carries on, as it does in AWS.
 */
export interface ComponentBehavior<T> {
  arrive(input: ArriveInput<T>): Effect<T>[];
  finish(input: FinishInput<T>): Effect<T>[];
  /**
   * The `async` work of a dispatched request is done. On failure the
   * component may dispatch it again later (e.g. SQS redelivery). Only called
   * on components whose definition sets `deliversAsync`.
   */
  dispatchFinished?(input: DispatchFinishedInput<T>): Effect<T>[];
  /** Requests started and not yet finished. */
  readonly inProgress: number;
  /**
   * Items waiting inside the component: queued requests, plus, for
   * queue-like components, finished requests waiting to be dispatched (the
   * backlog). Messages being worked on by a consumer don't count, just as
   * in-flight SQS messages are invisible.
   */
  readonly queueDepth: number;
  /**
   * Type-specific values sampled once per metrics tick. A value measured
   * against a limit belongs in `limits` instead, which has true peaks.
   * Names are camelCase and stable across a run.
   */
  readonly gauges?: Readonly<Record<string, number>>;
  /**
   * Type-specific running totals since the run began, e.g. Lambda
   * `coldStarts`. They never decrease; metrics report the increase per tick.
   */
  readonly counters?: Readonly<Record<string, number>>;
  /**
   * The limits this component enforces, each with its current use. The same
   * array of live views on every read: the engine reads it after every call,
   * so build it once. Optional; a component with no limits leaves it out.
   */
  readonly limits?: readonly LimitGauge[];
}
