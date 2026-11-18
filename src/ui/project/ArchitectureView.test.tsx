// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Selection } from "../../application/details/selection";
import type {
  Point,
  ProjectRecord,
} from "../../application/ports/project-record";
import { sampleRecord } from "../../application/testing/sample-record";
import type { RunBadges } from "../run/run-badges";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { ArchitectureView } from "./ArchitectureView";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { FADED_CLASS, ON_PATH_CLASS } from "../diagram/to-react-flow";
import { preloadBeforeAll } from "../shared/testing/preload-before-all";

/** The diagram's boxes, once React Flow has loaded and drawn them. */
async function drawnNodes(diagram: HTMLElement): Promise<Element[]> {
  await waitFor(() => {
    expect(diagram.querySelector(".react-flow__node")).not.toBeNull();
  });
  return [...diagram.querySelectorAll(".react-flow__node")];
}

interface RenderViewInput {
  readonly selection?: Selection;
  readonly badges?: RunBadges;
  readonly record?: ProjectRecord;
}

/** The sample, with a component no workflow uses. */
const withSpare: ProjectRecord = {
  ...sampleRecord,
  project: {
    ...sampleRecord.project,
    architecture: {
      ...sampleRecord.project.architecture,
      components: [
        ...sampleRecord.project.architecture.components,
        { id: "spare", type: "lambda", name: "Spare", config: {} },
      ],
    },
  },
};

/** Which of the boxes, by id, have the class. */
function boxesWith(nodes: Element[], className: string): (string | null)[] {
  return nodes
    .filter((node) => node.classList.contains(className))
    .map((node) => node.getAttribute("data-id"));
}

/** The view, with spies for what it reports. */
function renderView({
  selection,
  record = sampleRecord,
  badges,
}: RenderViewInput = {}) {
  const onSelect = vi.fn<(selection: Selection) => void>();
  const onClear = vi.fn<() => void>();
  const onMove = vi.fn<(componentId: string, position: Point) => void>();
  const tree = (shown: RunBadges | undefined) => (
    <UseCasesProvider useCases={fakeUseCases()}>
      <ArchitectureView
        record={record}
        selection={selection}
        badges={shown}
        onSelect={onSelect}
        onClear={onClear}
        onConnect={vi.fn()}
        offering={{ onEdit: vi.fn(), onSelect: vi.fn(), announce: vi.fn() }}
        onMove={onMove}
      />
    </UseCasesProvider>
  );
  const { rerender } = render(tree(badges));
  return {
    onSelect,
    onClear,
    onMove,
    /** Draws the same view again, with other badges. */
    showBadges: (shown: RunBadges | undefined) => {
      rerender(tree(shown));
    },
  };
}

function diagram(): HTMLElement {
  return screen.getByRole("group", {
    name: "Architecture diagram of Sample project",
  });
}

describe("ArchitectureView", () => {
  preloadBeforeAll(() => import("../diagram/DiagramCanvas"));
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if diagramOf drops a component: two boxes are drawn, not three.
  it("draws a labelled diagram with a box per component", async () => {
    renderView();

    expect(await drawnNodes(diagram())).toHaveLength(3);
  });

  // Fails if the view stops letting boxes be dragged, DiagramCanvas turns
  // on React Flow's own selection, stops letting a drag connect them, or
  // stops giving each box a tab stop and a description that says what
  // Enter, the arrow keys, and a drag do.
  it("lets each box move, connect, and take a tab stop to select it", async () => {
    renderView();

    for (const node of await drawnNodes(diagram())) {
      expect(node.classList.contains("draggable")).toBe(true);
      expect(node.classList.contains("selectable")).toBe(false);
      expect(node.getAttribute("tabindex")).toBe("0");
      const description = node.getAttribute("aria-describedby") ?? "";
      expect(document.getElementById(description)?.textContent).toBe(
        "Press Enter to show its details. Press the arrow keys, or drag it, to move it. Drag from its right edge to another box to connect them. The Components tab in the dock lists the same items.",
      );
    }
    const nodes = await drawnNodes(diagram());
    expect(
      diagram().querySelectorAll(".react-flow__handle.connectable"),
    ).toHaveLength(nodes.length * 2);
  });

  // Fails if Enter on a focused box doesn't select its component, or
  // selects by another key.
  it("selects a box's component when Enter is pressed on it", async () => {
    const { onSelect } = renderView();
    const [, fn] = await drawnNodes(diagram());

    fireEvent.keyDown(fn as Element, { key: " " });
    fireEvent.keyDown(fn as Element, { key: "Enter" });

    expect(onSelect.mock.calls).toEqual([
      [{ kind: "component", componentId: "fn" }],
    ]);
  });

  // Fails if a box's move isn't reported as its component's, at the place
  // it was put.
  it("moves a box's component to where it was put", async () => {
    const { onMove } = renderView();
    const [, fn] = await drawnNodes(diagram());

    fireEvent.keyDown(fn as Element, { key: "ArrowDown" });
    fireEvent.blur(fn as Element);

    expect(onMove.mock.calls).toEqual([["fn", { x: 250, y: 5 }]]);
  });

  // Fails if the diagram rings a box other than the selected component, or
  // none. jsdom lays nothing out, so React Flow draws no arrows here; the
  // selected arrow's mark is tested in to-react-flow.test.tsx.
  it("marks the selected box", async () => {
    renderView({ selection: { kind: "component", componentId: "table" } });
    const nodes = await drawnNodes(diagram());

    expect(nodes.map((node) => node.classList.contains("selected"))).toEqual([
      false,
      false,
      true,
    ]);
  });

  // Fails if the view stops passing a workflow's path to the diagram, or
  // the path takes in a component no step calls, or rings one. The path's
  // arrows are tested in selection-on-architecture.test.ts and
  // to-react-flow.test.tsx, since jsdom draws none.
  it("highlights the boxes of a selected workflow's path, and rings none", async () => {
    renderView({
      record: withSpare,
      selection: { kind: "workflow", workflowId: "read" },
    });
    const nodes = await drawnNodes(diagram());

    expect(boxesWith(nodes, ON_PATH_CLASS)).toEqual(["api", "fn", "table"]);
    expect(boxesWith(nodes, "selected")).toEqual([]);
  });

  // Fails if a selected workflow fades a box on its path, leaves a box off
  // it unfaded (the spare one), or anything is faded with no workflow
  // selected. The arrows' fade is tested in to-react-flow.test.tsx.
  it("fades the boxes off a selected workflow's path, and none with no workflow selected", async () => {
    renderView({
      record: withSpare,
      selection: { kind: "workflow", workflowId: "read" },
    });
    const nodes = await drawnNodes(diagram());
    expect(boxesWith(nodes, FADED_CLASS)).toEqual(["spare"]);
    cleanup();

    renderView({ record: withSpare });
    expect(boxesWith(await drawnNodes(diagram()), FADED_CLASS)).toEqual([]);
  });

  // Fails if a selected step rings its caller's box, or another, drops
  // its workflow's path, or fades a box on that path (or leaves the spare
  // one unfaded).
  it.each([
    ["fn-invoke", "fn"],
    ["api-invoke", "api"],
  ])("rings step %s's box, on its workflow's path", async (stepId, id) => {
    renderView({
      record: withSpare,
      selection: { kind: "step", workflowId: "read", stepId },
    });
    const nodes = await drawnNodes(diagram());

    expect(boxesWith(nodes, "selected")).toEqual([id]);
    expect(boxesWith(nodes, ON_PATH_CLASS)).toEqual(["api", "fn", "table"]);
    expect(boxesWith(nodes, FADED_CLASS)).toEqual(["spare"]);
  });

  // Fails if the canvas stops being a region named "Architecture", so a
  // screen reader can't jump to it.
  it("is a region named Architecture", () => {
    renderView();

    expect(screen.getByRole("region", { name: "Architecture" })).toBeTruthy();
  });
});

/** The tool rail's buttons, by their names, in order. */
function railButtons(): HTMLElement[] {
  const rail = screen.getByRole("toolbar", { name: "Tools" });
  return within(rail).getAllByRole("button");
}

/** A button on the tool rail. */
function railButton(name: string): HTMLElement {
  const rail = screen.getByRole("toolbar", { name: "Tools" });
  return within(rail).getByRole("button", { name });
}

describe("ArchitectureView's tool rail", () => {
  preloadBeforeAll(() => import("../diagram/DiagramCanvas"));
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if zoom or fit leaves the rail, Connect comes back to it, or
  // the rail's Workflows list, the workflow picker, or the bottom-left row
  // comes back: the Workflows tab is the one place a workflow is picked.
  it("holds zoom out, zoom in, and fit, and nothing else", () => {
    renderView();

    expect(
      railButtons().map((b) => b.getAttribute("aria-label") ?? b.title),
    ).toEqual(["Zoom out", "Zoom in", "Fit to screen"]);
    expect(screen.queryAllByRole("button", { name: /Workflows/ })).toEqual([]);
    expect(
      document.querySelector('[aria-haspopup="menu"], [aria-haspopup="true"]'),
    ).toBeNull();
  });

  // Fails if the rail's zoom isn't wired to the diagram once it has loaded,
  // or is usable on an empty canvas, which has nothing to zoom.
  it("makes zoom usable once the diagram has loaded, and not with no boxes", async () => {
    renderView();
    await waitFor(() => {
      expect(railButton("Zoom in").getAttribute("aria-disabled")).toBe("false");
    });
    cleanup();

    renderView({
      record: {
        ...sampleRecord,
        project: {
          ...sampleRecord.project,
          architecture: { components: [], edges: [] },
        },
      },
    });
    expect(railButton("Fit to screen").getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  // Fails if the canvas draws the text version again, or the project's
  // components and connections stop being the Components tab's alone.
  it("has no text version of its own: the dock's Components tab lists them", () => {
    renderView();

    expect(screen.queryByRole("button", { name: "As text" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Components" })).toBeNull();
  });
});

/** The sample, with its first `count` components and no edges. */
function unconnectedRecord(count: number): ProjectRecord {
  const { architecture } = sampleRecord.project;
  return {
    ...sampleRecord,
    project: {
      ...sampleRecord.project,
      architecture: {
        components: architecture.components.slice(0, count),
        edges: [],
      },
    },
  };
}

/** The canvas's line on how to connect boxes, if it's there. */
function connectLine(): HTMLElement | null {
  return screen.queryByText(
    "Drag from a box’s handle to another box to connect them",
  );
}

describe("ArchitectureView's connect line", () => {
  preloadBeforeAll(() => import("../diagram/DiagramCanvas"));
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the line doesn't show while there are boxes to connect and no
  // arrows, or becomes a control that takes a tab stop.
  it("says how to connect boxes while there are two or more and no arrows", () => {
    renderView({ record: unconnectedRecord(2) });

    const line = connectLine();
    expect(line?.tagName).toBe("P");
    expect(line?.closest("button, [tabindex]")).toBeNull();
  });

  // Fails if the line shows once there's an arrow, on an empty canvas
  // (which has its own line), or with a lone box, which has nothing to
  // connect to.
  it.each([
    ["an arrow", sampleRecord],
    ["no components", unconnectedRecord(0)],
    ["one component", unconnectedRecord(1)],
  ])("says nothing about connecting with %s", (_case, record) => {
    renderView({ record });

    expect(connectLine()).toBeNull();
  });
});
