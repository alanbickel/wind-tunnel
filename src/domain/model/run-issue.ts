import type { StepAction } from "./project";
import type { IssuePath } from "./validation-issue";

// Run issues (ADR-0019, decision 2): problems in a workflow or a workload
// that stop a run of the workloads they affect, but not a save. Each is a
// value, not a message, so whoever shows it can name what it's about by
// name rather than ID; `application/run-checks/` words them.

/** A step calls a component the architecture doesn't have. */
export interface UnknownComponentIssue {
  readonly kind: "unknown-component";
  /** To the step's `componentId`. */
  readonly path: IssuePath;
  readonly componentId: string;
}

/** A call, or a queue's delivery of async work, with no edge to follow. */
export interface MissingEdgeIssue {
  readonly kind: "missing-edge";
  /** To the step that's called. */
  readonly path: IssuePath;
  readonly fromId: string;
  readonly toId: string;
}

/** A step's component doesn't accept the step's action. */
export interface ActionNotAcceptedIssue {
  readonly kind: "action-not-accepted";
  /** To the step's `action`. */
  readonly path: IssuePath;
  readonly componentId: string;
  readonly action: StepAction;
  /** The actions the component's type accepts. */
  readonly accepted: readonly StepAction[];
}

/** A step that isn't `enqueue` has async work. */
export interface AsyncNotOnEnqueueIssue {
  readonly kind: "async-not-on-enqueue";
  /** To the step's `async`. */
  readonly path: IssuePath;
  readonly action: StepAction;
}

/** A step's component can't deliver async work: it isn't queue-like. */
export interface AsyncNotDeliveredIssue {
  readonly kind: "async-not-delivered";
  /** To the step's `async`. */
  readonly path: IssuePath;
  readonly componentId: string;
}

/** A problem with one of a workflow's steps. */
export type StepIssue =
  | UnknownComponentIssue
  | MissingEdgeIssue
  | ActionNotAcceptedIssue
  | AsyncNotOnEnqueueIssue
  | AsyncNotDeliveredIssue;

/** A workload's mix has no workflows. */
export interface EmptyMixIssue {
  readonly kind: "empty-mix";
  readonly path: IssuePath;
}

/** A mix entry names a workflow the project doesn't have. */
export interface UnknownWorkflowIssue {
  readonly kind: "unknown-workflow";
  readonly path: IssuePath;
  readonly workflowId: string;
}

/** A second mix entry for the same workflow. */
export interface RepeatedWorkflowIssue {
  readonly kind: "repeated-workflow";
  readonly path: IssuePath;
  readonly workflowId: string;
}

/** A mix entry's weight is zero, negative, or not a number. */
export interface WeightNotPositiveIssue {
  readonly kind: "weight-not-positive";
  readonly path: IssuePath;
  readonly workflowId: string;
  readonly weight: number;
}

/** A workload's profile has no points. */
export interface EmptyProfileIssue {
  readonly kind: "empty-profile";
  readonly path: IssuePath;
}

/** A profile point isn't later than the one before it. */
export interface ProfileTimeNotIncreasingIssue {
  readonly kind: "profile-time-not-increasing";
  readonly path: IssuePath;
  readonly atMs: number;
  readonly previousAtMs: number;
}

/** A profile point's rate is negative or not a number. */
export interface NegativeRateIssue {
  readonly kind: "negative-rate";
  readonly path: IssuePath;
  readonly atMs: number;
  readonly requestsPerSec: number;
}

/** A problem with a workload's own mix or profile. */
export type WorkloadIssue =
  | EmptyMixIssue
  | UnknownWorkflowIssue
  | RepeatedWorkflowIssue
  | WeightNotPositiveIssue
  | EmptyProfileIssue
  | ProfileTimeNotIncreasingIssue
  | NegativeRateIssue;

/** Any problem that stops a run but not a save. */
export type RunIssue = StepIssue | WorkloadIssue;
