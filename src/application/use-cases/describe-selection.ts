import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { Project } from "../../domain/model/project";
import {
  handleKind,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import { componentDetails } from "../details/component-details";
import type { Details } from "../details/details";
import { edgeDetails } from "../details/edge-details";
import type { FieldCatalog } from "../details/field-descriptor";
import type { Selection } from "../details/selection";

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
 * What the Details tab shows for a selected component or edge (UX design
 * §4.1): its settings, with their labels, units, help, and defaults, what
 * an editor needs, and what calls it. An edge's defaults are its caller
 * type's. Undefined if the project has no such item.
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
