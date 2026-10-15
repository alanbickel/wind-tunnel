import type { Edge, Workflow } from "../model/project";
import type { RuntimeComponent } from "./runtime-records";

/**
 * The parts of a project a run looks up as it goes: components with their
 * behaviors, the edges between them, and workflows. Each lookup throws if
 * the part is missing, which validation should have ruled out.
 */
export interface Topology {
  /** The component with this ID. */
  component(id: string): RuntimeComponent;
  /** Every component, in the project's order. */
  allComponents(): Iterable<RuntimeComponent>;
  /** The edge a call travels along; the user's call (no `fromId`) has none. */
  edgeFor(fromId: string | undefined, toId: string): Edge | undefined;
  /** The workflow with this ID. */
  workflow(id: string): Workflow;
}
