import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { Project, StepAction } from "../../domain/model/project";
import { newWorkflowName } from "../details/new-workflow-name";
import type { IdGenerator } from "../ports/id-generator";

export interface NewWorkflowDependencies {
  /** What actions each type accepts, and its display name. */
  readonly registry: ComponentRegistry;
  /** The new workflow's id, and its first step's. */
  readonly ids: IdGenerator;
}

/** The project a workflow is to be added to. */
export interface NewWorkflowInput {
  readonly project: Project;
}

/** A component a new workflow's first step can call. */
export interface FirstStepChoice {
  readonly componentId: string;
  /** E.g. "orders-db (RDS)": its name, then its type's display name. */
  readonly label: string;
  /**
   * What its type accepts, in the type's order; empty for a type the
   * registry doesn't know.
   */
  readonly actions: readonly StepAction[];
}

/** What the UI needs to start a new workflow, and to add it once it's complete. */
export interface NewWorkflowStart {
  readonly workflowId: string;
  readonly rootStepId: string;
  /** The first free "workflow-1", "workflow-2", …, which passes the name check. */
  readonly name: string;
  /** Every component, in project order. */
  readonly components: readonly FirstStepChoice[];
}

/**
 * What a new workflow starts with (UX design §2.5 steps 1 and 2): its ids,
 * a free name, and the components its first step can call, each with the
 * actions its type accepts. It changes nothing: the workflow is added, with
 * `addWorkflow`, only once its first step is complete.
 */
export class NewWorkflow {
  private readonly deps: NewWorkflowDependencies;

  constructor(deps: NewWorkflowDependencies) {
    this.deps = deps;
  }

  execute({ project }: NewWorkflowInput): NewWorkflowStart {
    const { registry, ids } = this.deps;
    const components = project.architecture.components.map((c) => {
      const type = registry.get(c.type);
      return {
        componentId: c.id,
        label: `${c.name} (${type?.displayName ?? c.type})`,
        actions: type?.actions ?? [],
      };
    });
    return {
      workflowId: ids.newId(),
      rootStepId: ids.newId(),
      name: newWorkflowName(project),
      components,
    };
  }
}
