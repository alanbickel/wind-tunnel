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
  /** `request` begins its work here now; its own work takes `serviceMs`. */
  | {
      readonly kind: "started";
      readonly request: T;
      readonly serviceMs: number;
    }
  /** `request` waits inside the component; a later `started` will follow. */
  | { readonly kind: "queued"; readonly request: T }
  /** `request` failed to get in, e.g. `"throttled"` or `"too-many-connections"`. */
  | { readonly kind: "rejected"; readonly request: T; readonly reason: string }
  /**
   * Start `request`'s `async` step now (queue-like components only). Sent
   * after the request has finished here, when a consumer takes the message.
   */
  | { readonly kind: "dispatched"; readonly request: T };

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
  arrive(request: T, action: StepAction, nowMs: number): Effect<T>[];
  finish(request: T, nowMs: number): Effect<T>[];
  /**
   * The `async` work of a dispatched request is done. On failure the
   * component may dispatch it again later (e.g. SQS redelivery). Only called
   * on components whose definition sets `deliversAsync`.
   */
  dispatchFinished?(request: T, succeeded: boolean, nowMs: number): Effect<T>[];
  /** Requests started and not yet finished. */
  readonly inProgress: number;
  /**
   * Items waiting inside the component: queued requests, plus, for
   * queue-like components, finished requests waiting to be dispatched (the
   * backlog). Messages being worked on by a consumer don't count, just as
   * in-flight SQS messages are invisible.
   */
  readonly queueDepth: number;
}
