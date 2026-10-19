// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { ArchitectureView } from "./ArchitectureView";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";

function itemsOf(listName: string): (string | null)[] {
  const list = screen.getByRole("list", { name: listName });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

describe("ArchitectureView", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("draws a labelled diagram with a box per component", () => {
    render(<ArchitectureView record={sampleRecord} />);

    const diagram = screen.getByRole("group", {
      name: "Architecture diagram of Sample project",
    });
    expect(diagram.querySelectorAll(".react-flow__node")).toHaveLength(3);
  });

  it("offers nothing to move, select, connect, or tab to", () => {
    render(<ArchitectureView record={sampleRecord} />);
    const diagram = screen.getByRole("group", {
      name: "Architecture diagram of Sample project",
    });

    for (const node of diagram.querySelectorAll(".react-flow__node")) {
      expect(node.classList.contains("draggable")).toBe(false);
      expect(node.classList.contains("selectable")).toBe(false);
      expect(node.hasAttribute("tabindex")).toBe(false);
      const description = node.getAttribute("aria-describedby") ?? "";
      expect(document.getElementById(description)?.textContent).toBe(
        "Read-only. The text version after the diagram lists the same items.",
      );
    }
    expect(
      diagram.querySelectorAll(".react-flow__handle.connectable"),
    ).toHaveLength(0);
  });

  it("lists the components and connections as text", () => {
    render(<ArchitectureView record={sampleRecord} />);

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
});
