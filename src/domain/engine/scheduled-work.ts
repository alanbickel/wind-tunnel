import type { Attempt, Call, Visit } from "./runtime-records";
import type { Failure } from "./simulation-events";

/**
 * What the engine schedules on its own event queue: work that falls due at a
 * later simulated time. Internal to the engine; what it reports to observers
 * is a `SimulationEvent`.
 */
export type ScheduledWork =
  | UserDue
  | AttemptReachesTarget
  | VisitServiceDone
  | AttemptAnswered
  | AttemptTimedOut
  | CallRetryDue
  | VisitNothingToDeliver;

/** The next user from the workload arrives. */
interface UserDue {
  readonly kind: "user-due";
}

/** An attempt has crossed its edge and arrives at the component it calls. */
interface AttemptReachesTarget {
  readonly kind: "attempt-reaches-target";
  readonly attempt: Attempt;
}

/** A visit's service time has elapsed. */
interface VisitServiceDone {
  readonly kind: "visit-service-done";
  readonly visit: Visit;
}

/** The answer to an attempt has crossed back over its edge to the caller. */
interface AttemptAnswered {
  readonly kind: "attempt-answered";
  readonly attempt: Attempt;
  readonly failure: Failure | undefined;
}

/** The caller stops waiting for an attempt. */
interface AttemptTimedOut {
  readonly kind: "attempt-timed-out";
  readonly attempt: Attempt;
}

/** A call's backoff has elapsed; it sends its next attempt. */
interface CallRetryDue {
  readonly kind: "call-retry-due";
  readonly call: Call;
}

/**
 * A queue-like component dispatched a message whose step has no `async` step
 * to run, so the delivery succeeds at once.
 */
interface VisitNothingToDeliver {
  readonly kind: "visit-nothing-to-deliver";
  readonly visit: Visit;
}
