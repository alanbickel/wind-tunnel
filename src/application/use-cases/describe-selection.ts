import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { Project } from "../../domain/model/project";
import { stepsOfWorkflow } from "../../domain/model/step-tree";
import {
  handleKind,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import { componentDetails } from "../details/component-details";
import type { Details } from "../details/details";
import { edgeDetails } from "../details/edge-details";
import type { FieldCatalog } from "../details/field-descriptor";
import type { Selection } from "../details/selection";
import { workflowDetails } from "../details/workflow-details";

export interface DescribeSelectionDependencies {
  /** Each type's display name and default config. */
  readonly registry: ComponentRegistry;
  /** Each type's setting descriptors. */
  readonly fields: FieldCatalog;
}

/** The selection to describe, in the project it was made in. */
export interface DescribeSelectionInput {
  readonly project: Project;
  readonly selection: Selection;
}

/**
 * What the Details tab shows for a selection (UX design §4.1): for a
 * component or an edge, its settings, with their labels, units, help, and
 * defaults, what an editor needs, and what calls it; an edge's defaults are
 * its caller type's. For a workflow, or a step in one, the workflow's
 * outline and the workloads that use it. Undefined if the project has no
 * such item.
 */
export class DescribeSelection {
  private readonly deps: DescribeSelectionDependencies;

  constructor(deps: DescribeSelectionDependencies) {
    this.deps = deps;
  }

  execute({ project, selection }: DescribeSelectionInput): Details | undefined {
    return handleKind(this.describers(project), selection);
  }

  private describers(
    project: Project,
  ): KindHandlers<Selection, Details | undefined> {
    return {
      component: ({ componentId }) =>
        this.describeComponent({ project, id: componentId }),
      edge: ({ edgeId }) => this.describeEdge({ project, id: edgeId }),
      workflow: ({ workflowId }) =>
        describeWorkflow({ project, id: workflowId, stepId: undefined }),
      step: ({ workflowId, stepId }) =>
        describeWorkflow({ project, id: workflowId, stepId }),
    };
  }

  private describeComponent({ project, id }: ItemInput): Details | undefined {
    const { registry, fields } = this.deps;
    const component = project.architecture.components.find((c) => c.id === id);
    if (component === undefined) return undefined;
    const { type } = component;
    return componentDetails({
      project,
      component,
      type: registry.get(type),
      fields: fields.get(type),
      displayNameOf: (other) => registry.get(other)?.displayName ?? other,
    });
  }

  /** The edge, with its caller type's edge defaults and their evidence. */
  private describeEdge({ project, id }: ItemInput): Details | undefined {
    const { registry, fields } = this.deps;
    const { components, edges } = project.architecture;
    const edge = edges.find((e) => e.id === id);
    if (edge === undefined) return undefined;
    const callerType = components.find((c) => c.id === edge.from)?.type ?? "";
    return edgeDetails({
      project,
      edge,
      defaults: registry.get(callerType)?.edgeDefaults,
      evidence: fields.get(callerType)?.edgeEvidence,
    });
  }
}

/** A selected item, by its id, in its project. */
interface ItemInput {
  readonly project: Project;
  readonly id: string;
}

/** A selected workflow, or the step selected in it. */
interface WorkflowItemInput extends ItemInput {
  /** The selected step's id; undefined for the workflow itself. */
  readonly stepId: string | undefined;
}

/**
 * The workflow's outline, with the step marked if one is selected;
 * undefined if the project has no such workflow, or it has no such step.
 */
function describeWorkflow({
  project,
  id,
  stepId,
}: WorkflowItemInput): Details | undefined {
  const workflow = project.workflows.find((w) => w.id === id);
  if (workflow === undefined) return undefined;
  const steps = stepsOfWorkflow(workflow);
  if (stepId !== undefined && !steps.some((s) => s.id === stepId)) {
    return undefined;
  }
  return workflowDetails({ project, workflow, currentStepId: stepId });
}
