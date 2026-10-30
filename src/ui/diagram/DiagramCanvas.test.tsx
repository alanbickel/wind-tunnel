// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiagramCanvas } from "./DiagramCanvas";
import type { DiagramContent } from "./diagram-model";
import { stubDiagramBrowserApis } from "./testing/stub-diagram-browser-apis";

const fitView = vi.fn(() => Promise.resolve(true));

// React Flow calls its own fitView inside; only the canvas's goes to the spy.
vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  useReactFlow: () => ({ fitView }),
}));

const content: DiagramContent = { nodes: [], edges: [] };

/** Sets the size React Flow measures its box at (jsdom lays nothing out). */
function measureBoxAt(width: number, height: number): void {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(
    height,
  );
}

function resizeWindow(): void {
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

describe("DiagramCanvas", () => {
  beforeEach(() => {
    stubDiagramBrowserApis();
    measureBoxAt(800, 400);
    render(<DiagramCanvas content={content} />);
    fitView.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Fails if the canvas drops FitViewOnResize, or it stops watching the
  // height: the diagram would keep its first fit and clip the lower boxes.
  it("fits the view again when its box changes size", () => {
    measureBoxAt(800, 200);
    resizeWindow();

    expect(fitView).toHaveBeenCalledTimes(1);
  });

  // Fails if FitViewOnResize refits on every resize event, undoing the
  // user's pan and zoom when nothing about the box changed.
  it("keeps the view when a resize leaves its box the same size", () => {
    resizeWindow();

    expect(fitView).not.toHaveBeenCalled();
  });
});

describe("DiagramCanvas's connections", () => {
  const boxes: DiagramContent = {
    nodes: [
      { id: "a", label: "A", caption: "a", position: { x: 0, y: 0 } },
      { id: "b", label: "B", caption: "b", position: { x: 200, y: 0 } },
    ],
    edges: [],
  };
  beforeEach(() => {
    stubDiagramBrowserApis();
    measureBoxAt(800, 400);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** The boxes' handles that a drag can start or end on. */
  const connectableHandles = (container: HTMLElement) =>
    container.querySelectorAll(".react-flow__handle.connectable");

  // Fails if the canvas lets a drag connect boxes when nothing would save
  // the arrow, or stops letting it when onConnect is given.
  it("lets a drag connect boxes only when given onConnect", () => {
    const readOnly = render(<DiagramCanvas content={boxes} />);
    expect(connectableHandles(readOnly.container)).toHaveLength(0);
    cleanup();

    const drawable = render(
      <DiagramCanvas content={boxes} onConnect={vi.fn()} />,
    );
    // Each box has a handle on each side: one to start from, one to end on.
    expect(connectableHandles(drawable.container)).toHaveLength(4);
  });
});
