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

describe("Diagram", () => {
  preloadBeforeAll(() => import("./DiagramCanvas"));
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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
});
