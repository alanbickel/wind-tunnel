import type { ComponentRegistry } from "../../domain/components/component-registry";
import type {
  Component,
  Project,
  StepAction,
} from "../../domain/model/project";

/** A component a step's call can go to. */
export interface CallChoice {
  readonly componentId: string;
  /** Its name, as Undo and the announcements say it. */
  readonly name: string;
  /** E.g. "orders-db (RDS)": its name, then its type's display name. */
  readonly label: string;
  /** What its type accepts, in the type's order; empty for an unknown type. */
  readonly actions: readonly StepAction[];
}

/** The components to choose from, and whose calls they would be. */
export interface CallChoicesInput {
  readonly registry: ComponentRegistry;
  readonly project: Project;
  /** The caller's component; undefined for a workflow's first step, which has no caller and so can call any component. */
  readonly caller: Component | undefined;
  /**
   * A component to offer even without an edge from the caller: the one a
   * step being changed calls now, whose edge may since have gone, so the
   * picker shows what the step is.
   */
  readonly currentId?: string | undefined;
}

/**
 * The components a call can go to: those the caller has an edge to, in edge
 * order (a call never adds an edge, ADR-0019's addendum of 2026-11-12), and
 * then `currentId`'s component if the caller has no edge to it. With no
 * caller, every component in project order. Empty if the caller has no
 * edges.
 */
export function callChoices(input: CallChoicesInput): CallChoice[] {
  const { registry, project, caller, currentId } = input;
  const { components, edges } = project.architecture;
  const ids =
    caller === undefined
      ? components.map((c) => c.id)
      : edges.filter((e) => e.from === caller.id).map((e) => e.to);
  if (currentId !== undefined && !ids.includes(currentId)) ids.push(currentId);
  return ids
    .map((id) => components.find((c) => c.id === id))
    .filter((component) => component !== undefined)
    .map((component) => choiceOf(registry, component));
}

function choiceOf(
  registry: ComponentRegistry,
  component: Component,
): CallChoice {
  const type = registry.get(component.type);
  return {
    componentId: component.id,
    name: component.name,
    label: `${component.name} (${type?.displayName ?? component.type})`,
    actions: type?.actions ?? [],
  };
}
