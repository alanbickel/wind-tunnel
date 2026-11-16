import type { Selection } from "../../application/details/selection";
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import type { DiagramItem, DiagramItemKind } from "../diagram/diagram-model";
import { dispatchKind } from "../shared/kind-dispatch";

/**
 * The diagram item, a box or an arrow, that each kind of selection is
 * marked on in the Components tab's lists, or undefined for a workflow or
 * a step: their paths are lines of text, not items to select.
 */
const ITEMS: KindHandlers<Selection, DiagramItem | undefined> = {
  component: ({ componentId }) => ({ kind: "node", id: componentId }),
  edge: ({ edgeId }) => ({ kind: "edge", id: edgeId }),
  workflow: () => undefined,
  step: () => undefined,
  workload: () => undefined,
  "new-workflow": () => undefined,
  // The run marks nothing: its badges are on every box, as always.
  run: () => undefined,
  // The finding's component is the list's marked row.
  finding: ({ key }) => ({ kind: "node", id: key.componentId }),
};

/** The item a selection is marked on, if it's on one. */
export function itemOf(selection: Selection): DiagramItem | undefined {
  return dispatchKind(ITEMS, selection);
}

/** The selection each kind of diagram item stands for. */
const SELECTIONS: Readonly<Record<DiagramItemKind, (id: string) => Selection>> =
  {
    node: (componentId) => ({ kind: "component", componentId }),
    edge: (edgeId) => ({ kind: "edge", edgeId }),
  };

/** The selection a click on the item, or its row, makes. */
export function selectionOf(item: DiagramItem): Selection {
  return SELECTIONS[item.kind](item.id);
}
