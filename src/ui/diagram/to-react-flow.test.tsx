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
  type EdgeOffer,
} from "./diagram-model";
import {
  FADED_CLASS,
  ON_PATH_CLASS,
  toFlowEdge,
  toFlowNode,
  withOffer,
} from "./to-react-flow";
import { OFFER_EDGE_TYPE } from "./OfferEdge";

/** Marks that select only `item`. */
function selecting(item: DiagramItem): DiagramMarks {
  return { selected: [item], path: [], numbers: [] };
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
    const marks = {
      selected: [],
      path: [{ kind: "node", id: "fn" }],
      numbers: [],
    } as const;

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
  // same id puts it on the path (it is faded instead). jsdom draws no
  // arrows, so this is where an arrow's path mark is tested.
  it("gives the edge the path class only when it's on the path", () => {
    const onPath = {
      selected: [],
      path: [{ kind: "edge", id: "a-b" }],
      numbers: [],
    } as const;
    const nodeOnPath = {
      selected: [],
      path: [{ kind: "node", id: "a-b" }],
      numbers: [],
    } as const;

    expect(toFlowEdge(aToB, onPath).className).toBe(ON_PATH_CLASS);
    expect(toFlowEdge(aToB, nodeOnPath).className).toBe(FADED_CLASS);
  });
});

const noteOn = (id: string): DiagramMarks => ({
  selected: [],
  path: [{ kind: "node", id }],
  numbers: [],
});

describe("fading what's off the path", () => {
  // Fails if a part off the path isn't faded, a part on it is, or any part
  // is faded while no path is marked (nothing selected, or a component).
  it("fades exactly the boxes and arrows off a marked path", () => {
    const marks: DiagramMarks = {
      selected: [],
      path: [
        { kind: "node", id: "fn" },
        { kind: "edge", id: "a-b" },
      ],
      numbers: [],
    };
    const other: DiagramEdge = { id: "b-c", source: "b", target: "c" };
    const spare: DiagramNode = { ...fn, id: "spare" };

    expect(toFlowNode(fn, marks).className).toBe(ON_PATH_CLASS);
    expect(toFlowNode(spare, marks).className).toBe(FADED_CLASS);
    expect(toFlowEdge(aToB, marks).className).toBe(ON_PATH_CLASS);
    expect(toFlowEdge(other, marks).className).toBe(FADED_CLASS);
    expect(toFlowNode(spare, NO_MARKS).className).toBeUndefined();
    expect(toFlowEdge(other, NO_MARKS).className).toBeUndefined();
    expect(toFlowNode(spare, noteOn("fn")).className).toBe(FADED_CLASS);
  });
});

describe("numbering the calls on an arrow", () => {
  const numbered = (numbers: readonly number[]): DiagramMarks => ({
    selected: [],
    path: [{ kind: "edge", id: "a-b" }],
    numbers: [{ edgeId: "a-b", numbers }],
  });

  // Fails if an arrow's label isn't its calls' numbers in order, one shared
  // by several calls doesn't list each, or an arrow no call follows is labeled.
  it("labels an arrow with each call's number, and an unnumbered one with none", () => {
    expect(toFlowEdge(aToB, numbered([2])).label).toBe("2");
    expect(toFlowEdge(aToB, numbered([1, 4])).label).toBe("1, 4");
    const other: DiagramEdge = { id: "b-c", source: "b", target: "c" };
    expect(toFlowEdge(other, numbered([1])).label).toBeUndefined();
    expect(toFlowEdge(aToB, NO_MARKS).label).toBeUndefined();
  });
});

describe("withOffer", () => {
  const offer: EdgeOffer = {
    edgeId: "a-b",
    label: "Add a call from A to B",
    onUse: () => undefined,
  };

  // Fails if an arrow with an offer isn't drawn by the offer edge, which
  // carries the offer (no button would be drawn), or keeps nothing of the
  // arrow it was: its marks and numbers, which the offer edge draws too.
  it("draws an arrow with an offer as the offer edge, keeping the rest of it", () => {
    const marks: DiagramMarks = {
      selected: [],
      path: [{ kind: "edge", id: "a-b" }],
      numbers: [{ edgeId: "a-b", numbers: [3] }],
    };
    const plain = toFlowEdge(aToB, marks);

    const offered = withOffer(plain, offer);

    expect(offered).toEqual({
      ...plain,
      type: OFFER_EDGE_TYPE,
      data: { offer },
    });
    expect(offered.className).toBe(ON_PATH_CLASS);
    expect(offered.label).toBe("3");
  });

  // Fails if an arrow with no offer is changed: it would be drawn by the
  // offer edge with nothing to offer.
  it("leaves an arrow with no offer as it was", () => {
    const plain = toFlowEdge(aToB, NO_MARKS);

    expect(withOffer(plain, undefined)).toBe(plain);
  });
});
