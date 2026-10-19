import { MarkerType, Position } from "@xyflow/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { toFlowEdge, toFlowNode } from "./to-react-flow";

describe("toFlowNode", () => {
  it("keeps the ID and position and shows the label over the caption", () => {
    const node = toFlowNode({
      id: "fn",
      label: "Function",
      caption: "lambda",
      position: { x: 250, y: 40 },
    });

    expect(node.id).toBe("fn");
    expect(node.position).toEqual({ x: 250, y: 40 });
    // Layouts run left to right, so arrows leave right and arrive left.
    expect(node.sourcePosition).toBe(Position.Right);
    expect(node.targetPosition).toBe(Position.Left);
    expect(renderToStaticMarkup(node.data.label as ReactNode)).toBe(
      "<strong>Function</strong><br/><small>lambda</small>",
    );
  });
});

describe("toFlowEdge", () => {
  it("joins source to target with an arrowhead at the target", () => {
    expect(toFlowEdge({ id: "a-b", source: "a", target: "b" })).toEqual({
      id: "a-b",
      source: "a",
      target: "b",
      markerEnd: { type: MarkerType.ArrowClosed },
    });
  });
});
