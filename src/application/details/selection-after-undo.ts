import type { Project } from "../../domain/model/project";
import { stepsOfWorkflow } from "../../domain/model/step-tree";
import {
  handleKind,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import type { Selection } from "./selection";

/** The project an undo or a redo leaves, the one it goes to, and the selection. */
export interface SelectionAfterUndoInput {
  readonly from: Project;
  readonly to: Project;
  readonly selection: Selection | undefined;
}

/** What an undo or a redo does to the selection. */
export type SelectionChange = SelectChange | ClearChange | KeepChange;

/** Selects what the undo or redo brought back. */
export interface SelectChange {
  readonly kind: "select";
  readonly selection: Selection;
}

/**
 * Clears the selection, whose component, edge, workflow, or step the undo
 * or redo took away.
 */
export interface ClearChange {
  readonly kind: "clear";
}

/** Leaves the selection as it is. */
export interface KeepChange {
  readonly kind: "keep";
}

/**
 * The selection after an undo or a redo (UX design §4.1). One that brings
 * back a component, as undoing its remove does, selects it; one that brings
 * back only an edge selects the edge. One that takes away the selected
 * component, edge, workflow, or step clears the selection: a step goes
 * when it leaves its workflow, or its workflow goes. Anything else keeps it.
 */
export function selectionAfterUndo({
  from,
  to,
  selection,
}: SelectionAfterUndoInput): SelectionChange {
  const brought = broughtBack({ from, to });
  if (brought !== undefined) return { kind: "select", selection: brought };
  if (selection === undefined || isIn(to, selection)) return { kind: "keep" };
  return { kind: "clear" };
}

/** The projects either side of an undo or a redo. */
type ProjectsInput = Pick<SelectionAfterUndoInput, "from" | "to">;

/** The first component `to` has that `from` didn't, else the first such edge. */
function broughtBack({ from, to }: ProjectsInput): Selection | undefined {
  const component = firstNew(
    to.architecture.components,
    from.architecture.components,
  );
  if (component !== undefined) {
    return { kind: "component", componentId: component.id };
  }
  const edge = firstNew(to.architecture.edges, from.architecture.edges);
  return edge && { kind: "edge", edgeId: edge.id };
}

/** Something with an id, as components and edges have. */
interface Identified {
  readonly id: string;
}

/** The first of `items` whose id isn't among `earlier`'s. */
function firstNew<T extends Identified>(
  items: readonly T[],
  earlier: readonly T[],
): T | undefined {
  const ids = new Set(earlier.map((item) => item.id));
  return items.find((item) => !ids.has(item.id));
}

/** Whether the project has the selected component, edge, workflow, or step. */
function isIn(project: Project, selection: Selection): boolean {
  return handleKind(PRESENCE, selection)(project);
}

const PRESENCE: KindHandlers<Selection, (project: Project) => boolean> = {
  component:
    ({ componentId }) =>
    ({ architecture }) =>
      architecture.components.some((c) => c.id === componentId),
  edge:
    ({ edgeId }) =>
    ({ architecture }) =>
      architecture.edges.some((e) => e.id === edgeId),
  workflow:
    ({ workflowId }) =>
    ({ workflows }) =>
      workflows.some((w) => w.id === workflowId),
  step:
    ({ workflowId, stepId }) =>
    ({ workflows }) => {
      const workflow = workflows.find((w) => w.id === workflowId);
      return (
        workflow !== undefined &&
        stepsOfWorkflow(workflow).some((s) => s.id === stepId)
      );
    },
};
