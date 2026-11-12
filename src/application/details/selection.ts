import type { FindingKey } from "../run-analysis/findings/finding";

/**
 * What the user has selected on a project screen (UX design §4.1). The
 * screen holds one selection or none; it isn't saved with the project.
 */
export type Selection =
  | ComponentSelection
  | EdgeSelection
  | WorkflowSelection
  | StepSelection
  | WorkloadSelection
  | NewWorkflowSelection
  | FindingSelection;

/** A component, by its id. */
export interface ComponentSelection {
  readonly kind: "component";
  readonly componentId: string;
}

/** An edge, by its id. */
export interface EdgeSelection {
  readonly kind: "edge";
  readonly edgeId: string;
}

/** A workflow, by its id. */
export interface WorkflowSelection {
  readonly kind: "workflow";
  readonly workflowId: string;
}

/** A workload, by its id. */
export interface WorkloadSelection {
  readonly kind: "workload";
  readonly workloadId: string;
}

/**
 * A step, by its id, and the workflow it's in. A step's id is unique in
 * the project (ADR-0020); the workflow says whose outline shows it.
 */
export interface StepSelection {
  readonly kind: "step";
  readonly workflowId: string;
  readonly stepId: string;
}

/**
 * A workflow being made, which isn't in the project yet: it has a name and
 * a first step, and is saved once the step has a component and an action.
 * Selecting anything else drops it, so no half-made workflow is stored.
 */
export interface NewWorkflowSelection {
  readonly kind: "new-workflow";
}

/**
 * A finding of the run on screen, by its key. Unlike the others it has no
 * Details: it marks its component on the diagram, and the inspector stays
 * on the Run tab. The finding is worded from the run's copy of the
 * project (ADR-0018), so its component may be gone from the project.
 */
export interface FindingSelection {
  readonly kind: "finding";
  readonly key: FindingKey;
}
