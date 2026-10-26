/**
 * What the user has selected on a project screen (UX design §4.1). The
 * screen holds one selection or none; it isn't saved with the project.
 * Workflows, steps, workloads, and findings join the union as they become
 * selectable.
 */
export type Selection = ComponentSelection | EdgeSelection;

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
