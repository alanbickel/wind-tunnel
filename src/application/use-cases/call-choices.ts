import type { ComponentRegistry } from "../../domain/components/component-registry";
import type {
  Component,
  Project,
  StepAction,
} from "../../domain/model/project";
import { newEdgeNote } from "../details/add-call-text";

/** A component a step's call can go to. */
export interface CallChoice {
  readonly componentId: string;
  /** Its name, as Undo and the announcements say it. */
  readonly name: string;
  /** E.g. "orders-db (RDS)": its name, then its type's display name. */
  readonly label: string;
  /** What its type accepts, in the type's order; empty for an unknown type. */
  readonly actions: readonly StepAction[];
  /** True when the caller has no edge to it, so choosing it adds one. */
  readonly addsEdge: boolean;
  /** What marks a choice that adds an edge; undefined for a neighbour. */
  readonly note: string | undefined;
}

/** The components to choose from, and whose calls they would be. */
export interface CallChoicesInput {
  readonly registry: ComponentRegistry;
  readonly project: Project;
  /** The caller's component; undefined for a workflow's first step, which has no caller and so adds no edge. */
  readonly caller: Component | undefined;
}

/**
 * Every component but the caller's own, the caller's neighbours first, each
 * group in project order. With no caller, every component, none adding an
 * edge.
 */
export function callChoices(input: CallChoicesInput): CallChoice[] {
  const { project, caller } = input;
  const { components, edges } = project.architecture;
  const reached = new Set(
    edges.filter((e) => e.from === caller?.id).map((e) => e.to),
  );
  const choices = components
    .filter((c) => c.id !== caller?.id)
    .map((component) =>
      choiceOf({
        registry: input.registry,
        caller,
        component,
        addsEdge: caller !== undefined && !reached.has(component.id),
      }),
    );
  // Array.sort is stable: false (neighbours) sorts before true.
  return choices.sort((a, b) => Number(a.addsEdge) - Number(b.addsEdge));
}

/** A component to offer, whose call it would be, and whether choosing it adds an edge. */
interface ChoiceInput {
  readonly registry: ComponentRegistry;
  readonly caller: Component | undefined;
  readonly component: Component;
  readonly addsEdge: boolean;
}

function choiceOf({
  registry,
  caller,
  component,
  addsEdge,
}: ChoiceInput): CallChoice {
  const type = registry.get(component.type);
  return {
    componentId: component.id,
    name: component.name,
    label: `${component.name} (${type?.displayName ?? component.type})`,
    actions: type?.actions ?? [],
    addsEdge,
    note: addsEdge && caller ? newEdgeNote(caller.name) : undefined,
  };
}
