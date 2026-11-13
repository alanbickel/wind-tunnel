import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import {
  isAmong,
  type DiagramEdge,
  type DiagramItem,
  type DiagramMarks,
  type DiagramNode,
} from "./diagram-model";
import { NodeCard } from "./NodeCard";

/**
 * The class on a box or an arrow on the marked path, which
 * Diagram.module.css draws apart from the selection.
 */
export const ON_PATH_CLASS = "on-path";

/**
 * The class on a box or an arrow off a marked path, which Diagram.module.css
 * fades.
 */
export const FADED_CLASS = "faded";

/** A node's or an edge's class, as React Flow takes it. */
type ItemClass = Pick<Node, "className">;

/**
 * The path class if `item` is on the path, the faded class if there is a
 * path and it isn't on it, and no class if there's no path.
 */
function pathClassOf(marks: DiagramMarks, item: DiagramItem): ItemClass {
  if (marks.path.length === 0) return {};
  return { className: isAmong(marks.path, item) ? ON_PATH_CLASS : FADED_CLASS };
}

/** The label of an edge's call numbers, "1, 4", or no label for none. */
function numbersLabelOf(
  marks: DiagramMarks,
  edge: DiagramEdge,
): Pick<Edge, "label"> {
  const numbers = marks.numbers.find((n) => n.edgeId === edge.id)?.numbers;
  return numbers === undefined ? {} : { label: numbers.join(", ") };
}

/**
 * A node as React Flow takes it: its card is rendered inside the box. Arrows
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
      label: <NodeCard node={node} />,
    },
  };
}

/**
 * An edge as React Flow takes it, with an arrowhead at the target. A
 * selected edge has the `selected` class, which Diagram.module.css thickens;
 * an edge on the path has the path class too, and one off a path the faded
 * class. An edge that carries calls is labeled with their numbers.
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
    ...numbersLabelOf(marks, edge),
  };
}
