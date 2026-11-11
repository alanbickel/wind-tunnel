import { MarkerType, Position } from "@xyflow/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  NO_MARKS,
  type DiagramEdge,
  type DiagramItem,
  type DiagramMarks,
  type DiagramNode,
} from "./diagram-model";
import { ON_PATH_CLASS, toFlowEdge, toFlowNode } from "./to-react-flow";

/** Marks that select only `item`. */
function selecting(item: DiagramItem): DiagramMarks {
  return { selected: [item], path: [] };
}

const fn: DiagramNode = {
  id: "fn",
  label: "Function",
  caption: "Lambda",
  icon: "lambda",
  position: { x: 250, y: 40 },
};

const aToB: DiagramEdge = { id: "a-b", source: "a", target: "b" };

describe("toFlowNode", () => {
  it("keeps the ID and position and draws a card with the label over the caption", () => {
    const node = toFlowNode(fn, NO_MARKS);

    expect(node.id).toBe("fn");
    expect(node.position).toEqual({ x: 250, y: 40 });
    // Layouts run left to right, so arrows leave right and arrive left.
    expect(node.sourcePosition).toBe(Position.Right);
    expect(node.targetPosition).toBe(Position.Left);
    const card = renderToStaticMarkup(node.data.label as ReactNode);
    expect(card).toContain("<strong");
    expect(card.indexOf(">Function<")).toBeLessThan(
      card.indexOf(">Lambda</small>"),
    );
  });

  // Fails if a node is marked selected by its id alone, so an edge with the
  // same id as a node would ring the node.
  it("marks the node selected only when the selection is that node", () => {
    expect(toFlowNode(fn, selecting({ kind: "node", id: "fn" })).selected).toBe(
      true,
    );
    expect(toFlowNode(fn, selecting({ kind: "edge", id: "fn" })).selected).toBe(
      false,
    );
    expect(
      toFlowNode(fn, selecting({ kind: "node", id: "table" })).selected,
    ).toBe(false);
  });

  // Fails if a node on the path loses the path class, or one off it, or a
  // selected node, gets it.
  it("gives the node the path class only when it's on the path", () => {
    const marks = { selected: [], path: [{ kind: "node", id: "fn" }] } as const;

    expect(toFlowNode(fn, marks).className).toBe(ON_PATH_CLASS);
    expect(toFlowNode(fn, { ...marks, path: [] }).className).toBeUndefined();
    expect(
      toFlowNode(fn, selecting({ kind: "node", id: "fn" })).className,
    ).toBeUndefined();
  });
});

describe("toFlowEdge", () => {
  it("joins source to target with an arrowhead at the target", () => {
    expect(toFlowEdge(aToB, NO_MARKS)).toEqual({
      id: "a-b",
      source: "a",
      target: "b",
      markerEnd: { type: MarkerType.ArrowClosed },
      selected: false,
    });
  });

  // Fails if an edge is marked selected by its id alone.
  it("marks the edge selected only when the selection is that edge", () => {
    expect(
      toFlowEdge(aToB, selecting({ kind: "edge", id: "a-b" })).selected,
    ).toBe(true);
    expect(
      toFlowEdge(aToB, selecting({ kind: "node", id: "a-b" })).selected,
    ).toBe(false);
  });

  // Fails if an edge on the path loses the path class, or a node of the
  // same id puts it on the path. jsdom draws no arrows, so this is where
  // an arrow's path mark is tested.
  it("gives the edge the path class only when it's on the path", () => {
    const onPath = {
      selected: [],
      path: [{ kind: "edge", id: "a-b" }],
    } as const;
    const nodeOnPath = {
      selected: [],
      path: [{ kind: "node", id: "a-b" }],
    } as const;

    expect(toFlowEdge(aToB, onPath).className).toBe(ON_PATH_CLASS);
    expect(toFlowEdge(aToB, nodeOnPath).className).toBeUndefined();
  });
});
