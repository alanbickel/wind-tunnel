// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiagramCanvas } from "./DiagramCanvas";
import type { DiagramContent } from "./diagram-model";
import {
  stubDiagramBrowserApis,
  stubMeasuringResizeObserver,
} from "./testing/stub-diagram-browser-apis";
import { ZoomButtons } from "./ZoomButtons";
import type { ZoomActions } from "./zoom-actions";

const content: DiagramContent = {
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
      position: { x: 300, y: 0 },
    },
  ],
  edges: [],
};

/** The diagram's zoom level, as React Flow draws it. */
function scale(): number {
  const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
  const match = /scale\(([^)]+)\)/.exec(viewport?.style.transform ?? "");
  return Number(match?.[1]);
}

/** Draws the canvas and the buttons that zoom it, as the screen does. */
function Harness() {
  const [zoom, setZoom] = useState<ZoomActions>();
  return (
    <>
      <DiagramCanvas content={content} onZoom={setZoom} />
      <ZoomButtons zoom={zoom} />
    </>
  );
}

async function press(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await Promise.resolve();
  });
}

describe("The canvas's zoom buttons", () => {
  beforeEach(() => {
    stubDiagramBrowserApis();
    stubMeasuringResizeObserver();
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Fails if the buttons don't reach React Flow's zoom, or zoom the wrong
  // way. (Fit is tested in DiagramCanvas.test.tsx: jsdom measures nothing,
  // so React Flow's own fit never runs here.)
  it("zooms the view in and out", async () => {
    render(<Harness />);
    // Let the automatic fit land first, so it can't move the view under us.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const fitted = scale();

    await press("Zoom in");
    expect(scale()).toBeGreaterThan(fitted);

    await press("Zoom out");
    await press("Zoom out");
    expect(scale()).toBeLessThan(fitted);
  });

  // Fails if the buttons act before the canvas has reported its zoom, or
  // lose their names: each is an icon, named by its label and tooltip.
  it("names each button and says it's unusable until the canvas loads", () => {
    render(<ZoomButtons zoom={undefined} />);

    for (const name of ["Zoom out", "Zoom in", "Fit to screen"]) {
      const button = screen.getByRole("button", { name });
      expect(button.getAttribute("title")).toBe(name);
      expect(button.getAttribute("aria-disabled")).toBe("true");
    }
  });
});
