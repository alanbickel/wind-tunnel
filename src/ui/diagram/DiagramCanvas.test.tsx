// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiagramCanvas } from "./DiagramCanvas";
import type { DiagramContent } from "./diagram-model";
import { dragNode, mouse } from "./testing/drag-node";
import {
  stubDiagramBrowserApis,
  stubMeasuringResizeObserver,
} from "./testing/stub-diagram-browser-apis";
import { KEYBOARD_MOVE_PAUSE_MS } from "./useNodeMoves";

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
      {
        id: "a",
        label: "A",
        caption: "a",
        icon: "a",
        position: { x: 0, y: 0 },
      },
      {
        id: "b",
        label: "B",
        caption: "b",
        icon: "b",
        position: { x: 200, y: 0 },
      },
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

describe("DiagramCanvas's moves", () => {
  const boxes: DiagramContent = {
    nodes: [
      {
        id: "a",
        label: "A",
        caption: "a",
        icon: "a",
        position: { x: 0, y: 0 },
      },
      {
        id: "b",
        label: "B",
        caption: "b",
        icon: "b",
        position: { x: 200, y: 0 },
      },
    ],
    edges: [],
  };
  beforeEach(() => {
    stubDiagramBrowserApis();
    measureBoxAt(800, 400);
  });
  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // After a drag, d3-drag swallows the window's next click until a
    // zero-delay timeout; let it run, or the next test's click is lost.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

  function boxB(container: HTMLElement): HTMLElement {
    const box = container.querySelector('.react-flow__node[data-id="b"]');
    if (!(box instanceof HTMLElement)) throw new Error("no box b");
    return box;
  }

  function press(box: HTMLElement, key: string, shiftKey = false): void {
    fireEvent.keyDown(box, { key, shiftKey });
  }

  /** Waits out the pause after the arrow keys, which reports their move. */
  function pause(): void {
    act(() => {
      vi.advanceTimersByTime(KEYBOARD_MOVE_PAUSE_MS);
    });
  }

  // Fails if a canvas that moves boxes but doesn't select them leaves them
  // out of the tab order, so its description offers arrow keys no one can
  // use.
  it("lets the keyboard reach a box it can move without onSelect", () => {
    const { container } = render(
      <DiagramCanvas content={boxes} onMove={vi.fn()} />,
    );

    expect(boxB(container).tabIndex).toBe(0);
  });

  // Fails if a canvas given no onMove lets boxes be dragged, or moves one
  // with the arrow keys: nothing would save the move.
  it("keeps the boxes fixed without onMove", () => {
    const { container } = render(
      <DiagramCanvas content={boxes} onSelect={vi.fn()} />,
    );
    const box = boxB(container);

    press(box, "ArrowRight");
    dragNode({ box, by: [50, 30] });

    expect(box.classList.contains("draggable")).toBe(false);
    expect(box.style.transform).toBe("translate(200px,0px)");
  });

  // Fails if the canvas hands React Flow new boxes without the sizes it
  // measured: React Flow hides each box, and its arrows, until it measures
  // it again, so the boxes flash on every step of a drag.
  it("keeps every box shown while one is dragged", async () => {
    stubMeasuringResizeObserver();
    const { container } = render(
      <DiagramCanvas content={boxes} onMove={vi.fn()} />,
    );
    // The boxes' first measurement, a tick after they're drawn.
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    const box = boxB(container);

    mouse({ target: box, type: "mouseDown", point: [210, 10] });
    mouse({ target: document, type: "mouseMove", point: [220, 10] });
    mouse({ target: document, type: "mouseMove", point: [250, 50] });

    const shown = [...container.querySelectorAll(".react-flow__node")].map(
      (node) => (node as HTMLElement).style.visibility,
    );
    expect(shown).toEqual(["visible", "visible"]);
    mouse({ target: document, type: "mouseUp", point: [250, 50] });
  });

  // Fails if the canvas reports while the box is dragged, so each step
  // would save, or not when the drag ends; or the box snaps back to where
  // its content has it before the content changes.
  it("reports a drag once, when it ends, and draws the box where it was put", () => {
    const onMove = vi.fn();
    const { container } = render(
      <DiagramCanvas content={boxes} onMove={onMove} />,
    );
    const box = boxB(container);

    mouse({ target: box, type: "mouseDown", point: [210, 10] });
    mouse({ target: document, type: "mouseMove", point: [220, 10] });
    mouse({ target: document, type: "mouseMove", point: [250, 50] });
    expect(onMove).not.toHaveBeenCalled();
    expect(box.style.transform).toBe("translate(230px,40px)");
    mouse({ target: document, type: "mouseUp", point: [250, 50] });

    expect(onMove.mock.calls).toEqual([
      [{ id: "b", position: { x: 230, y: 40 } }],
    ]);
    expect(box.style.transform).toBe("translate(230px,40px)");
  });

  // Fails if a click reports a move, as reporting from the click rather
  // than the drag's end would, saving the box where it already is; or a
  // drag-capable box stops selecting on a click. React Flow calls neither
  // onNodeDragStart nor onNodeDragStop for a click, so this also guards
  // that across upgrades.
  it("reports no move for a click, which selects the box", () => {
    const onMove = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <DiagramCanvas content={boxes} onMove={onMove} onSelect={onSelect} />,
    );
    const box = boxB(container);

    mouse({ target: box, type: "mouseDown", point: [210, 10] });
    mouse({ target: document, type: "mouseUp", point: [210, 10] });
    fireEvent.click(box);

    expect(onMove).not.toHaveBeenCalled();
    expect(onSelect.mock.calls).toEqual([[{ kind: "node", id: "b" }]]);
  });

  // Fails if each press reports a move, so a run of presses would be
  // several saves and undo steps, or the run isn't reported once the keys
  // pause, or the box doesn't move while the keys are pressed.
  it("reports a run of arrow key presses once, when the keys pause", () => {
    const onMove = vi.fn();
    const { container } = render(
      <DiagramCanvas content={boxes} onMove={onMove} onSelect={vi.fn()} />,
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const box = boxB(container);

    press(box, "ArrowRight");
    press(box, "ArrowRight");
    press(box, "ArrowDown", true);
    expect(box.style.transform).toBe("translate(210px,20px)");
    act(() => {
      vi.advanceTimersByTime(KEYBOARD_MOVE_PAUSE_MS - 1);
    });
    expect(onMove).not.toHaveBeenCalled();
    pause();

    expect(onMove.mock.calls).toEqual([
      [{ id: "b", position: { x: 210, y: 20 } }],
    ]);
  });

  // Fails if a drag doesn't report the arrow keys' held move when it
  // starts: the mouse doesn't blur the focused box, so the pause would
  // report the keys' move after the drag's, putting the box back.
  it("reports the arrow keys' move before a drag, so the drag's stays", () => {
    const onMove = vi.fn();
    const { container } = render(
      <DiagramCanvas content={boxes} onMove={onMove} onSelect={vi.fn()} />,
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const box = boxB(container);

    press(box, "ArrowRight");
    dragNode({ box, by: [40, 60] });
    pause();

    expect(onMove.mock.calls).toEqual([
      [{ id: "b", position: { x: 205, y: 0 } }],
      [{ id: "b", position: { x: 245, y: 60 } }],
    ]);
  });

  // Fails if a box that loses the focus keeps its move until the pause,
  // so a move then a click elsewhere could save after what the click did.
  it("reports the arrow keys' move when the box loses the focus", () => {
    const onMove = vi.fn();
    const { container } = render(
      <DiagramCanvas content={boxes} onMove={onMove} onSelect={vi.fn()} />,
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const box = boxB(container);

    press(box, "ArrowLeft");
    fireEvent.blur(box);

    expect(onMove.mock.calls).toEqual([
      [{ id: "b", position: { x: 195, y: 0 } }],
    ]);
  });

  // Fails if the canvas lets React Flow handle the arrow keys too: on its
  // selected box, React Flow moves it itself and interrupts the screen
  // reader with "Moved selected node up. New position, x: 200, y: 0", the
  // place it left, while no other box says anything.
  it("moves the selected box itself, one step a press, without React Flow's message", () => {
    const onMove = vi.fn();
    const { container } = render(
      <DiagramCanvas
        content={boxes}
        marks={{ selected: [{ kind: "node", id: "b" }], path: [] }}
        onMove={onMove}
        onSelect={vi.fn()}
      />,
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const box = boxB(container);

    press(box, "ArrowUp");
    pause();

    expect(onMove.mock.calls).toEqual([
      [{ id: "b", position: { x: 200, y: -5 } }],
    ]);
    const reactFlowLive = container.querySelector('[aria-live="assertive"]');
    expect(reactFlowLive?.textContent).toBe("");
  });
});
