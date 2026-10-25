import { MarkerType, Position } from "@xyflow/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { DiagramEdge, DiagramNode } from "./diagram-model";
import { toFlowEdge, toFlowNode } from "./to-react-flow";

const fn: DiagramNode = {
  id: "fn",
  label: "Function",
  caption: "lambda",
  position: { x: 250, y: 40 },
};

const aToB: DiagramEdge = { id: "a-b", source: "a", target: "b" };

describe("toFlowNode", () => {
  it("keeps the ID and position and shows the label over the caption", () => {
    const node = toFlowNode(fn, undefined);

    expect(node.id).toBe("fn");
    expect(node.position).toEqual({ x: 250, y: 40 });
    // Layouts run left to right, so arrows leave right and arrive left.
    expect(node.sourcePosition).toBe(Position.Right);
    expect(node.targetPosition).toBe(Position.Left);
    expect(renderToStaticMarkup(node.data.label as ReactNode)).toBe(
      "<strong>Function</strong><br/><small>lambda</small>",
    );
  });

  // Fails if a node is marked selected by its id alone, so an edge with the
  // same id as a node would ring the node.
  it("marks the node selected only when the selection is that node", () => {
    expect(toFlowNode(fn, { kind: "node", id: "fn" }).selected).toBe(true);
    expect(toFlowNode(fn, { kind: "edge", id: "fn" }).selected).toBe(false);
    expect(toFlowNode(fn, { kind: "node", id: "table" }).selected).toBe(false);
  });
});

describe("toFlowEdge", () => {
  it("joins source to target with an arrowhead at the target", () => {
    expect(toFlowEdge(aToB, undefined)).toEqual({
      id: "a-b",
      source: "a",
      target: "b",
      markerEnd: { type: MarkerType.ArrowClosed },
      selected: false,
    });
  });

  // Fails if an edge is marked selected by its id alone.
  it("marks the edge selected only when the selection is that edge", () => {
    expect(toFlowEdge(aToB, { kind: "edge", id: "a-b" }).selected).toBe(true);
    expect(toFlowEdge(aToB, { kind: "node", id: "a-b" }).selected).toBe(false);
  });
});
