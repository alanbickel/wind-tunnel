import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import {
  isAmong,
  type DiagramEdge,
  type DiagramItem,
  type DiagramMarks,
  type DiagramNode,
} from "./diagram-model";

/**
 * The class on a box or an arrow on the marked path, which
 * Diagram.module.css draws apart from the selection.
 */
export const ON_PATH_CLASS = "on-path";

/** A node's or an edge's class, as React Flow takes it. */
type ItemClass = Pick<Node, "className">;

/** The path class, if `item` is on the path; otherwise no class. */
function pathClassOf(marks: DiagramMarks, item: DiagramItem): ItemClass {
  return isAmong(marks.path, item) ? { className: ON_PATH_CLASS } : {};
}

/**
 * A node as React Flow takes it: the label is rendered inside the box. Arrows
 * leave from the right and arrive on the left, since layouts run left to
 * right, from the entry point to the data stores. React Flow marks a selected
 * node with its `selected` class, which Diagram.module.css rings; a node on
 * the path has the path class too.
 */
export function toFlowNode(node: DiagramNode, marks: DiagramMarks): Node {
  const item = { kind: "node", id: node.id } as const;
  return {
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected: isAmong(marks.selected, item),
    ...pathClassOf(marks, item),
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
 * selected edge has the `selected` class, which Diagram.module.css thickens;
 * an edge on the path has the path class too.
 */
export function toFlowEdge(edge: DiagramEdge, marks: DiagramMarks): Edge {
  const item = { kind: "edge", id: edge.id } as const;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    markerEnd: { type: MarkerType.ArrowClosed },
    selected: isAmong(marks.selected, item),
    ...pathClassOf(marks, item),
  };
}
