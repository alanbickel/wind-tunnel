import { ComponentTally } from "./component-tally";
import type {
  ComponentMetrics,
  MetricsSnapshot,
  WorkflowMetrics,
} from "./metrics-snapshot";
import { WorkflowTally } from "./workflow-tally";

/** Running counts for every component and workflow. */
export class Tally {
  private readonly components = new Map<string, ComponentTally>();
  private readonly workflows = new Map<string, WorkflowTally>();

  constructor(componentIds: string[], workflowIds: string[]) {
    for (const id of componentIds) this.component(id);
    for (const id of workflowIds) this.workflow(id);
  }

  component(id: string): ComponentTally {
    let tally = this.components.get(id);
    if (tally === undefined) {
      tally = new ComponentTally();
      this.components.set(id, tally);
    }
    return tally;
  }

  workflow(id: string): WorkflowTally {
    let tally = this.workflows.get(id);
    if (tally === undefined) {
      tally = new WorkflowTally();
      this.workflows.set(id, tally);
    }
    return tally;
  }

  add(window: Tally): void {
    for (const [id, tally] of window.components) this.component(id).add(tally);
    for (const [id, tally] of window.workflows) this.workflow(id).add(tally);
  }

  reset(): void {
    for (const tally of this.components.values()) tally.reset();
    for (const tally of this.workflows.values()) tally.reset();
  }

  snapshot(startMs: number, endMs: number): MetricsSnapshot {
    const components: Record<string, ComponentMetrics> = {};
    for (const [id, tally] of this.components) components[id] = tally.metrics();
    const workflows: Record<string, WorkflowMetrics> = {};
    for (const [id, tally] of this.workflows) workflows[id] = tally.metrics();
    return { startMs, endMs, components, workflows };
  }
}
