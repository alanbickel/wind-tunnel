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
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { ArchitectureView } from "./ArchitectureView";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { ON_PATH_CLASS } from "../diagram/to-react-flow";
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
}: RenderViewInput = {}) {
  const onSelect = vi.fn<(selection: Selection) => void>();
  const onClear = vi.fn<() => void>();
  const onAdd = vi.fn<(type: string) => void>();
  const onMove = vi.fn<(componentId: string, position: Point) => void>();
  render(
    <UseCasesProvider useCases={fakeUseCases()}>
      <ArchitectureView
        record={record}
        selection={selection}
        onSelect={onSelect}
        onClear={onClear}
        onConnect={vi.fn()}
        onMove={onMove}
        adding={{ onAdd, buttonRef: { current: null }, announcement: "" }}
      />
    </UseCasesProvider>,
  );
  return { onSelect, onClear, onAdd, onMove };
}

function diagram(): HTMLElement {
  return screen.getByRole("group", {
    name: "Architecture diagram of Sample project",
  });
}

function itemsOf(listName: string): (string | null)[] {
  const list = screen.getByRole("list", { name: listName });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent);
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
        "Press Enter to show its details. Press the arrow keys, or drag it, to move it. Drag from its right edge to another box to connect them. The text version after the diagram lists the same items.",
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

  // Fails if a selected step rings its caller's box, or another, or drops
  // its workflow's path.
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
  });

  it("lists the components and connections as text", () => {
    renderView();

    expect(itemsOf("Components")).toEqual([
      "API (api-gateway)",
      "Function (lambda)",
      "Table (dynamodb)",
    ]);
    expect(itemsOf("Connections")).toEqual([
      "API → Function",
      "Function → Table",
    ]);
  });

  // Fails if the text version stops listing each workflow's path.
  it("lists each workflow's path as text", () => {
    renderView();

    expect(itemsOf("Workflow paths")).toEqual([
      "Read item: API → Function → Table (read).",
    ]);
  });

  // Fails if a project with no workflows gets an empty "Workflow paths"
  // list, which a screen reader announces as a list of zero items.
  it("leaves the paths out when there are no workflows", () => {
    renderView({
      record: {
        ...sampleRecord,
        project: { ...sampleRecord.project, workflows: [] },
      },
    });

    expect(itemsOf("Components")).toHaveLength(3);
    expect(screen.queryByRole("list", { name: "Workflow paths" })).toBeNull();
  });

  // Fails if a text-version button selects the wrong kind of item or the
  // wrong one, or the list doesn't mark the selection as current.
  it("selects from the text version, and marks the selection there", () => {
    const { onSelect } = renderView({
      selection: { kind: "edge", edgeId: "api-fn" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Table (dynamodb)" }));
    fireEvent.click(screen.getByRole("button", { name: "Function → Table" }));

    expect(onSelect.mock.calls).toEqual([
      [{ kind: "component", componentId: "table" }],
      [{ kind: "edge", edgeId: "fn-table" }],
    ]);
    const current = screen.getAllByRole("button", { current: true });
    expect(current.map((button) => button.textContent)).toEqual([
      "API → Function",
    ]);
  });

  // Fails if ArchitectureView stops passing `scrolls` to its Panel: in a
  // short wide window the panel scrolls on its own, and the keyboard
  // couldn't scroll it.
  it("is a region the keyboard can focus, to scroll it", () => {
    renderView();

    expect(screen.getByRole("region", { name: "Architecture" }).tabIndex).toBe(
      0,
    );
  });
});
