// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Diagram } from "./Diagram";
import type { DiagramContent } from "./diagram-model";
import { stubDiagramBrowserApis } from "./testing/stub-diagram-browser-apis";

const fitView = vi.fn(() => Promise.resolve(true));

// React Flow calls its own fitView inside; only the Diagram's goes to the spy.
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

describe("Diagram", () => {
  beforeEach(() => {
    stubDiagramBrowserApis();
    measureBoxAt(800, 400);
    render(<Diagram content={content} label="Sample diagram" />);
    fitView.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Fails if the Diagram drops FitViewOnResize, or it stops watching the
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
