// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preloadBeforeAll } from "../shared/testing/preload-before-all";
import { Diagram } from "./Diagram";
import type { DiagramContent } from "./diagram-model";
import { stubDiagramBrowserApis } from "./testing/stub-diagram-browser-apis";

const content: DiagramContent = {
  nodes: [
    {
      id: "api",
      label: "API",
      caption: "api-gateway",
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

/** `Diagram` as the app gets it when React Flow's chunk won't load. */
async function diagramWithoutReactFlow(): Promise<typeof Diagram> {
  vi.resetModules();
  vi.doMock("./DiagramCanvas", () => {
    throw new Error("Failed to fetch dynamically imported module");
  });
  return (await import("./Diagram")).Diagram;
}

describe("Diagram", () => {
  preloadBeforeAll(() => import("./DiagramCanvas"));
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.doUnmock("./DiagramCanvas");
    vi.restoreAllMocks();
  });

  // Fails if Diagram renders the lazy canvas without its own Suspense
  // boundary: nothing shows, not even the labelled box, until React Flow
  // has loaded.
  it("holds its place while React Flow loads, then draws the boxes", async () => {
    const { container } = render(
      <Diagram content={content} label="Sample diagram" />,
    );

    const diagram = screen.getByRole("group", { name: "Sample diagram" });
    expect(diagram.textContent).toBe("Loading the diagram…");
    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node")).toHaveLength(1);
    });
    expect(screen.queryByText("Loading the diagram…")).toBeNull();
  });

  // Fails if Diagram drops its LoadFailureBoundary: React unmounts the
  // whole tree, and the labelled box is gone.
  it("says so in its box if React Flow won't load", async () => {
    // React logs the error it caught; the test expects it.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const FailingDiagram = await diagramWithoutReactFlow();
    render(<FailingDiagram content={content} label="Sample diagram" />);

    const diagram = screen.getByRole("group", { name: "Sample diagram" });
    await waitFor(() => {
      expect(diagram.textContent).toBe(
        "Couldn't load the diagram. Reload the page to try again.",
      );
    });
  });
});
