// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRail } from "./ToolRail";
import { useCanvasPanels } from "./useCanvasPanels";

/** The rail with the screen's panel state, and lists of one button each. */
function Harness() {
  const panels = useCanvasPanels();
  return (
    <>
      <button type="button">Canvas</button>
      <ToolRail
        panels={panels}
        workflows={<button type="button">Add workflow</button>}
        workloads={<button type="button">Add workload</button>}
        workflowAnnouncement=""
      />
    </>
  );
}

function renderRail() {
  render(<Harness />);
}

function railButton(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

describe("ToolRail", () => {
  afterEach(cleanup);

  // Fails if a rail button loses its name or its tooltip, or the rail stops
  // being a toolbar with the three buttons in order, or "Add component" comes back.
  it("is a toolbar of three icon buttons, each with a name and a tooltip", () => {
    renderRail();

    const toolbar = screen.getByRole("toolbar", { name: "Tools" });
    const buttons = [...toolbar.querySelectorAll("button")];
    const names = ["Connect", "Workflows", "Workloads"];
    expect(buttons.map((b) => b.textContent)).toEqual(names);
    expect(buttons.map((b) => b.title)).toEqual(names);
    expect(buttons.every((b) => b.querySelector("svg[aria-hidden]"))).toBe(
      true,
    );
  });

  // Fails if Connect's hint leaves out the drag or the keyboard's way, or
  // doesn't close on Escape or on a click outside it.
  it("opens Connect's hint with both ways to connect, and closes it", () => {
    renderRail();
    expect(screen.queryByRole("region", { name: "Connect" })).toBeNull();

    fireEvent.click(railButton("Connect"));
    const hint = screen.getByRole("region", { name: "Connect" });
    expect(hint.textContent).toContain("Drag from a box’s handle");
    expect(hint.textContent).toContain("“Connect to…” in its Details");

    fireEvent.keyDown(hint, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Connect" })).toBeNull();
    expect(document.activeElement).toBe(railButton("Connect"));

    fireEvent.click(railButton("Connect"));
    fireEvent.mouseDown(railButton("Canvas"));
    expect(screen.queryByRole("region", { name: "Connect" })).toBeNull();
  });

  // Fails if Workflows and Workloads share a list, or lose their own Add
  // buttons, or a list closes when the canvas is clicked, which would end
  // a pick through its rows.
  it("opens Workflows and Workloads as separate lists that stay open", () => {
    renderRail();

    fireEvent.click(railButton("Workflows"));
    fireEvent.mouseDown(railButton("Canvas"));
    expect(railButton("Add workflow")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add workload" })).toBeNull();

    fireEvent.click(railButton("Workloads"));
    expect(railButton("Add workload")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add workflow" })).toBeNull();
  });

  // Fails if opening one rail panel leaves another open, or Escape in a list
  // doesn't close it with the focus on its button.
  it("opens one panel at a time, and closes a list on Escape", () => {
    renderRail();
    fireEvent.click(railButton("Connect"));
    expect(screen.getByRole("region", { name: "Connect" })).toBeTruthy();
    fireEvent.click(railButton("Workflows"));
    expect(screen.queryByRole("region", { name: "Connect" })).toBeNull();

    fireEvent.keyDown(railButton("Add workflow"), { key: "Escape" });

    expect(screen.queryByRole("button", { name: "Add workflow" })).toBeNull();
    expect(document.activeElement).toBe(railButton("Workflows"));
  });

  // Fails if the toolbar stops handling the arrow keys, flips their
  // directions, or stops wrapping at either end.
  it("moves the focus between the buttons with Down and Up, wrapping at the ends", () => {
    renderRail();
    railButton("Connect").focus();

    fireEvent.keyDown(railButton("Connect"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(railButton("Workflows"));

    fireEvent.keyDown(railButton("Workflows"), { key: "ArrowUp" });
    fireEvent.keyDown(railButton("Connect"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(railButton("Workloads"));

    fireEvent.keyDown(railButton("Workloads"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(railButton("Connect"));
  });
});
