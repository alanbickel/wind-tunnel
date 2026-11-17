// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ZoomActions } from "../diagram/zoom-actions";
import { ToolRail } from "./ToolRail";
import { useCanvasPanels } from "./useCanvasPanels";

interface HarnessProps {
  readonly zoom: ZoomActions | undefined;
}

/** The rail with the screen's panel state, and a button outside it. */
function Harness({ zoom }: HarnessProps) {
  const panels = useCanvasPanels();
  return (
    <>
      <button type="button">Canvas</button>
      <ToolRail panels={panels} zoom={zoom} />
    </>
  );
}

function renderRail(zoom?: ZoomActions) {
  render(<Harness zoom={zoom} />);
}

function railButton(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

describe("ToolRail", () => {
  afterEach(cleanup);

  // Fails if a rail button loses its name or its tooltip, or the rail stops
  // being a toolbar with zoom, fit, and Connect in order, or "Workflows",
  // now the dock's tab, comes back.
  it("is a toolbar of icon buttons, each with a name and a tooltip", () => {
    renderRail();

    const toolbar = screen.getByRole("toolbar", { name: "Tools" });
    const buttons = [...toolbar.querySelectorAll("button")];
    const names = ["Zoom out", "Zoom in", "Fit to screen", "Connect"];
    expect(
      buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(names);
    expect(buttons.map((b) => b.title)).toEqual(names);
    expect(buttons.every((b) => b.querySelector("svg[aria-hidden]"))).toBe(
      true,
    );
  });

  // Fails if a zoom button doesn't reach its action, or is usable before
  // the canvas has loaded.
  it("zooms and fits through the canvas's actions, once it has them", () => {
    renderRail();
    expect(railButton("Zoom in").getAttribute("aria-disabled")).toBe("true");
    cleanup();
    const zoom = { zoomIn: vi.fn(), zoomOut: vi.fn(), fit: vi.fn() };
    renderRail(zoom);

    fireEvent.click(railButton("Zoom in"));
    fireEvent.click(railButton("Zoom out"));
    fireEvent.click(railButton("Fit to screen"));

    expect(zoom.zoomIn).toHaveBeenCalledOnce();
    expect(zoom.zoomOut).toHaveBeenCalledOnce();
    expect(zoom.fit).toHaveBeenCalledOnce();
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

  // Fails if the toolbar stops handling the arrow keys, flips their
  // directions, or stops wrapping at either end.
  it("moves the focus between the buttons with Down and Up, wrapping at the ends", () => {
    renderRail();
    railButton("Zoom out").focus();

    fireEvent.keyDown(railButton("Zoom out"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(railButton("Zoom in"));

    fireEvent.keyDown(railButton("Zoom in"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(railButton("Zoom out"));

    fireEvent.keyDown(railButton("Zoom out"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(railButton("Connect"));

    fireEvent.keyDown(railButton("Connect"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(railButton("Zoom out"));
  });
});
