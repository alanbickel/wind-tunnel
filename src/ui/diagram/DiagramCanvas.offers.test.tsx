// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiagramCanvas } from "./DiagramCanvas";
import type {
  DiagramContent,
  DiagramItem,
  DiagramMarks,
  EdgeOffer,
  OfferQuestion,
} from "./diagram-model";
import {
  stubArrowDrawing,
  stubDiagramBrowserApis,
} from "./testing/stub-diagram-browser-apis";

const box = (id: string, x: number) => ({
  id,
  label: id,
  caption: "Lambda",
  icon: "lambda",
  position: { x, y: 0 },
});

// a → b → c, with offers on the first only.
const content: DiagramContent = {
  nodes: [box("a", 0), box("b", 300), box("c", 600)],
  edges: [
    { id: "a-b", source: "a", target: "b" },
    { id: "b-c", source: "b", target: "c" },
  ],
};

const LABEL = "Add a call from a to b";

function offerOf(onUse: () => OfferQuestion | undefined): EdgeOffer {
  return { edgeId: "a-b", label: LABEL, onUse };
}

/** The canvas, once React Flow has drawn both arrows. */
async function renderCanvas(
  offers: readonly EdgeOffer[],
  marks?: DiagramMarks,
) {
  const onSelect = vi.fn<(item: DiagramItem | undefined) => void>();
  render(
    <div style={{ width: 800, height: 400 }}>
      <DiagramCanvas
        content={content}
        offers={offers}
        marks={marks}
        onSelect={onSelect}
      />
    </div>,
  );
  await waitFor(() => {
    expect(document.querySelectorAll(".react-flow__edge")).toHaveLength(2);
  });
  return { onSelect };
}

describe("DiagramCanvas's arrow offers", () => {
  beforeEach(() => {
    stubDiagramBrowserApis();
    stubArrowDrawing();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Fails if an arrow with an offer draws no button, a button is drawn for
  // an arrow with none, or the button isn't named for what it does.
  it("draws a button on the arrow that has an offer, and only that one", async () => {
    await renderCanvas([offerOf(() => undefined)]);

    expect(screen.getAllByRole("button", { name: /^Add a call/ })).toHaveLength(
      1,
    );
    expect(screen.getByRole("button", { name: LABEL })).toBeTruthy();
  });

  // Fails if using the button doesn't reach the offer, or a click on it is
  // also a click on the arrow (selecting the edge would swap the workflow's
  // selection away from the path the user is adding to).
  it("uses the offer when the button is pressed, without selecting the arrow", async () => {
    const onUse = vi.fn(() => undefined);
    const { onSelect } = await renderCanvas([offerOf(onUse)]);

    fireEvent.click(screen.getByRole("button", { name: LABEL }));

    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  // Fails if an arrow with an offer stops being selectable by a click on
  // it: the offer edge must keep the arrow's own click target.
  it("still selects the arrow when the arrow itself is clicked", async () => {
    const { onSelect } = await renderCanvas([offerOf(() => undefined)]);
    const arrow = document.querySelector(".react-flow__edge[data-id='a-b']");

    fireEvent.click(arrow ?? document.body);

    expect(onSelect).toHaveBeenCalledWith({ kind: "edge", id: "a-b" });
  });

  // Fails if the button is a tab stop out of reach: it must be a real
  // button, with no tabindex taking it out of the order.
  it("makes the button a tab stop", async () => {
    await renderCanvas([offerOf(() => undefined)]);

    expect(screen.getByRole("button", { name: LABEL }).tabIndex).toBe(0);
  });

  // Fails if the arrow's call number is lost where the button is drawn.
  it("keeps the arrow's call numbers beside the button", async () => {
    const marks: DiagramMarks = {
      selected: [],
      path: [{ kind: "edge", id: "a-b" }],
      numbers: [{ edgeId: "a-b", numbers: [2, 5] }],
    };

    await renderCanvas([offerOf(() => undefined)], marks);

    expect(screen.getByText("2, 5")).toBeTruthy();
    expect(screen.getByRole("button", { name: LABEL })).toBeTruthy();
  });

  // Fails if the question isn't drawn on the canvas when the offer asks.
  it("draws the offer's question next to its button", async () => {
    await renderCanvas([offerOf(() => () => <p>Which action?</p>)]);

    fireEvent.click(screen.getByRole("button", { name: LABEL }));

    expect(screen.getByText("Which action?")).toBeTruthy();
  });
});
