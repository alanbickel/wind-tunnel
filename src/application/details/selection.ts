/**
 * What the user has selected on a project screen (UX design §4.1). The
 * screen holds one selection or none; it isn't saved with the project.
 * Workloads and findings join the union as they become selectable.
 */
export type Selection =
  ComponentSelection | EdgeSelection | WorkflowSelection | StepSelection;

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

/**
 * A step, by its id, and the workflow it's in. A step's id is unique in
 * the project (ADR-0020); the workflow says whose outline shows it.
 */
export interface StepSelection {
  readonly kind: "step";
  readonly workflowId: string;
  readonly stepId: string;
}
