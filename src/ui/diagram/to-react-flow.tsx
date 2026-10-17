import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import type { DiagramEdge, DiagramNode } from "./diagram-model";

/**
 * A node as React Flow takes it: the label is rendered inside the box. Arrows
 * leave from the right and arrive on the left, since layouts run left to
 * right, from the entry point to the data stores.
 */
export function toFlowNode(node: DiagramNode): Node {
  return {
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
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

/** An edge as React Flow takes it, with an arrowhead at the target. */
export function toFlowEdge(edge: DiagramEdge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    markerEnd: { type: MarkerType.ArrowClosed },
  };
}
