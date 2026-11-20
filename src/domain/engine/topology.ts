import type { RequestSettings } from "../components/component-behavior";
import type { Edge, Step, Workflow } from "../model/project";
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
  /**
   * The request settings `step`'s component gets with each arrival from
   * it, parsed when the run was built (ADR-0024). Only the steps of the
   * workload's workflows have them.
   */
  settingsFor(step: Step): RequestSettings;
}
