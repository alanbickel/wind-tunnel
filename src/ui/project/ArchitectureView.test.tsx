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
import type { ComponentStatus } from "../../application/run-analysis/component-status";
import { sampleRecord } from "../../application/testing/sample-record";
import type { RunBadges } from "../run/run-badges";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import {
  ArchitectureView,
  type ArchitectureViewProps,
} from "./ArchitectureView";
import { openPanel, type CanvasPanelButton } from "./testing/canvas-panels";
import { useCanvasPanels } from "./useCanvasPanels";
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

/** The view, holding which canvas panel is open, as the screen does. */
function WithPanels(props: Omit<ArchitectureViewProps, "panels">) {
  return <ArchitectureView {...props} panels={useCanvasPanels()} />;
}

/** The view, with spies for what it reports. */
function renderView({
  selection,
  record = sampleRecord,
  badges,
}: RenderViewInput = {}) {
  const onSelect = vi.fn<(selection: Selection) => void>();
  const onClear = vi.fn<() => void>();
  const onAdd = vi.fn<(type: string) => void>();
  const onMove = vi.fn<(componentId: string, position: Point) => void>();
  const tree = (shown: RunBadges | undefined) => (
    <UseCasesProvider useCases={fakeUseCases()}>
      <WithPanels
        record={record}
        selection={selection}
        badges={shown}
        onSelect={onSelect}
        onClear={onClear}
        onConnect={vi.fn()}
        addingWorkflow={{ onAdd: vi.fn(), buttonRef: { current: null } }}
        addingWorkload={{ onAdd: vi.fn(), buttonRef: { current: null } }}
        workflowAnnouncement=""
        onMove={onMove}
        adding={{ onAdd, buttonRef: { current: null }, announcement: "" }}
      />
    </UseCasesProvider>
  );
  const { rerender } = render(tree(badges));
  return {
    onSelect,
    onClear,
    onAdd,
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

  // Fails if the text version doesn't number a selected workflow's
  // connections as the canvas does (each call in order), or numbers any
  // with no workflow selected.
  it("numbers the connections in the text version while a workflow is selected", () => {
    renderView({ selection: { kind: "workflow", workflowId: "read" } });
    openPanel("As text");
    expect(itemsOf("Connections")).toEqual([
      "API → Function (call 1)",
      "Function → Table (call 2)",
    ]);
    cleanup();

    renderView();
    openPanel("As text");
    expect(itemsOf("Connections")).toEqual([
      "API → Function",
      "Function → Table",
    ]);
  });

  // Fails if the text version says "call" for an arrow that several calls
  // follow, or lists only one of its numbers.
  it("lists every number of a connection several calls follow, as calls", () => {
    const twice: ProjectRecord = {
      ...sampleRecord,
      project: {
        ...sampleRecord.project,
        workflows: sampleRecord.project.workflows.map((workflow) => ({
          ...workflow,
          root: {
            ...workflow.root,
            calls: [
              {
                id: "fn-invoke",
                componentId: "fn",
                action: "invoke",
                calls: [
                  { id: "table-read", componentId: "table", action: "read" },
                  { id: "table-again", componentId: "table", action: "read" },
                ],
              },
            ],
          },
        })),
      },
    };

    renderView({
      record: twice,
      selection: { kind: "workflow", workflowId: "read" },
    });
    openPanel("As text");

    expect(itemsOf("Connections")).toEqual([
      "API → Function (call 1)",
      "Function → Table (calls 2, 3)",
    ]);
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

  it("lists the components and connections as text", () => {
    renderView();
    openPanel("As text");

    expect(itemsOf("Components")).toEqual([
      "API (API Gateway)",
      "Function (Lambda)",
      "Table (DynamoDB)",
    ]);
    expect(itemsOf("Connections")).toEqual([
      "API → Function",
      "Function → Table",
    ]);
  });

  // Fails if the text version drops the status after a name, leaves it off
  // a component the run has no entry for, or loses the note when the run is
  // out of date (componentLine).
  it("lists each component's status as text, with a note when the run is out of date", () => {
    const statuses = new Map<string, ComponentStatus>([
      ["api", "ok"],
      ["fn", "waited"],
    ]);
    const { showBadges } = renderView({
      badges: { statuses, outOfDate: false },
    });
    openPanel("As text");

    expect(itemsOf("Components")).toEqual([
      "API (API Gateway): ok",
      "Function (Lambda): waited",
      "Table (DynamoDB)",
    ]);

    showBadges({ statuses, outOfDate: true });

    expect(itemsOf("Components")).toEqual([
      "API (API Gateway): ok, from an earlier version of the project",
      "Function (Lambda): waited, from an earlier version of the project",
      "Table (DynamoDB)",
    ]);
  });

  // Fails if the text version stops listing each workflow's path.
  it("lists each workflow's path as text", () => {
    renderView();
    openPanel("As text");

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
    openPanel("As text");

    expect(itemsOf("Components")).toHaveLength(3);
    expect(screen.queryByRole("list", { name: "Workflow paths" })).toBeNull();
  });

  // Fails if a text-version button selects the wrong kind of item or the
  // wrong one, or the list doesn't mark the selection as current.
  it("selects from the text version, and marks the selection there", () => {
    const { onSelect } = renderView({
      selection: { kind: "edge", edgeId: "api-fn" },
    });
    openPanel("As text");

    fireEvent.click(screen.getByRole("button", { name: "Table (DynamoDB)" }));
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

  // Fails if the canvas stops being a region named "Architecture", so a
  // screen reader can't jump to it.
  it("is a region named Architecture", () => {
    renderView();

    expect(screen.getByRole("region", { name: "Architecture" })).toBeTruthy();
  });
});

/** The region a canvas panel's button opens, by the name it gives it. */
const PANEL_REGIONS: Record<CanvasPanelButton, string> = {
  Workflows: "Workflows",
  Workloads: "Workloads",
  "As text": "Components, connections, and paths as text",
};

/** A button on the tool rail: the picker at the bottom left shares "Workflows". */
function railButton(name: string): HTMLElement {
  const rail = screen.getByRole("toolbar", { name: "Tools" });
  return within(rail).getByRole("button", { name });
}

describe("ArchitectureView's canvas panels", () => {
  preloadBeforeAll(() => import("../diagram/DiagramCanvas"));
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if a panel starts open, or its button stops saying whether it's
  // open, or opening one leaves the other open over it.
  it("opens one panel at a time over the canvas, each from its button", () => {
    renderView();
    const workflows = railButton("Workflows");
    const text = screen.getByRole("button", { name: "As text" });
    expect(screen.queryByRole("region", { name: "Workflows" })).toBeNull();

    fireEvent.click(workflows);
    expect(workflows.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("list", { name: "Workflows" })).toBeTruthy();

    fireEvent.click(text);
    expect(workflows.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "Workflows" })).toBeNull();
    expect(screen.getByRole("list", { name: "Components" })).toBeTruthy();

    fireEvent.click(text);
    expect(text.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Components" })).toBeNull();
  });

  // Fails if Escape in a panel doesn't close it, or leaves the focus in
  // the hidden panel rather than on the button that opened it.
  it.each(["Workflows", "Workloads", "As text"] as const)(
    "closes %s on Escape from inside it, the focus back on its button",
    (name) => {
      renderView();
      const button = openPanel(name);
      const panel = screen.getByRole("region", { name: PANEL_REGIONS[name] });
      const inside = within(panel).getAllByRole("button")[0] as HTMLElement;
      inside.focus();

      fireEvent.keyDown(inside, { key: "Escape" });

      expect(
        screen.queryByRole("region", { name: PANEL_REGIONS[name] }),
      ).toBeNull();
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(button);
    },
  );

  // Fails if a project with no components offers an empty text version.
  it("offers no text version without components, but still the workflows", () => {
    renderView({
      record: {
        ...sampleRecord,
        project: {
          ...sampleRecord.project,
          architecture: { components: [], edges: [] },
          workflows: [],
        },
      },
    });

    expect(screen.queryByRole("button", { name: "As text" })).toBeNull();
    expect(railButton("Workflows")).toBeTruthy();
  });
});
