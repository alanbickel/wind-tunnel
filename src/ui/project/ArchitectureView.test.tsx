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
import { sampleRecord } from "../../application/testing/sample-record";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { ArchitectureView } from "./ArchitectureView";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
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
}

/** The view, with spies for what it reports. */
function renderView({ selection }: RenderViewInput = {}) {
  const onSelect = vi.fn<(selection: Selection) => void>();
  const onClear = vi.fn<() => void>();
  const onAdd = vi.fn<(type: string) => void>();
  render(
    <UseCasesProvider useCases={fakeUseCases()}>
      <ArchitectureView
        record={sampleRecord}
        selection={selection}
        onSelect={onSelect}
        onClear={onClear}
        onConnect={vi.fn()}
        adding={{ onAdd, buttonRef: { current: null }, announcement: "" }}
      />
    </UseCasesProvider>,
  );
  return { onSelect, onClear, onAdd };
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

  // Fails if DiagramCanvas lets boxes be dragged or connected, turns on
  // React Flow's own selection, or stops giving each box a tab stop and a
  // description that says what Enter does.
  it("offers nothing to move or connect, and a tab stop to select each box", async () => {
    renderView();

    for (const node of await drawnNodes(diagram())) {
      expect(node.classList.contains("draggable")).toBe(false);
      expect(node.classList.contains("selectable")).toBe(false);
      expect(node.getAttribute("tabindex")).toBe("0");
      const description = node.getAttribute("aria-describedby") ?? "";
      expect(document.getElementById(description)?.textContent).toBe(
        "Press Enter to show its details. The text version after the diagram lists the same items.",
      );
    }
    expect(
      diagram().querySelectorAll(".react-flow__handle.connectable"),
    ).toHaveLength(0);
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
