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
