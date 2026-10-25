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
 * §4.1): its settings, read-only, with their labels, units, help, and
 * defaults, and what calls it. Undefined if the project has no such item.
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
    const { registry, fields } = this.deps;
    const { components, edges } = project.architecture;
    return {
      component: ({ componentId }) => {
        const component = components.find((c) => c.id === componentId);
        if (component === undefined) return undefined;
        const { type } = component;
        return componentDetails({
          project,
          component,
          type: registry.get(type),
          fields: fields.get(type),
        });
      },
      edge: ({ edgeId }) => {
        const edge = edges.find((e) => e.id === edgeId);
        return edge && edgeDetails(project, edge);
      },
    };
  }
}
