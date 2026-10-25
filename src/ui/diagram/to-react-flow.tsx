import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import type { DiagramEdge, DiagramItem, DiagramNode } from "./diagram-model";

/**
 * A node as React Flow takes it: the label is rendered inside the box. Arrows
 * leave from the right and arrive on the left, since layouts run left to
 * right, from the entry point to the data stores. React Flow marks a selected
 * node with its `selected` class, which Diagram.module.css rings.
 */
export function toFlowNode(
  node: DiagramNode,
  selected: DiagramItem | undefined,
): Node {
  return {
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected: isSelected(selected, { kind: "node", id: node.id }),
    data: {
      label: (
        <>
          <strong>{node.label}</strong>
          <br />
          <small>{node.caption}</small>
        </>
      ),
    },
  };
}

/**
 * An edge as React Flow takes it, with an arrowhead at the target. A
 * selected edge has the `selected` class, which Diagram.module.css thickens.
 */
export function toFlowEdge(
  edge: DiagramEdge,
  selected: DiagramItem | undefined,
): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    markerEnd: { type: MarkerType.ArrowClosed },
    selected: isSelected(selected, { kind: "edge", id: edge.id }),
  };
}

function isSelected(
  selected: DiagramItem | undefined,
  item: DiagramItem,
): boolean {
  return selected?.kind === item.kind && selected.id === item.id;
}
