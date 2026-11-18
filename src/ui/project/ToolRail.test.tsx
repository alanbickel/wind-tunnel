// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ZoomActions } from "../diagram/zoom-actions";
import { ToolRail } from "./ToolRail";

function renderRail(zoom?: ZoomActions) {
  render(<ToolRail zoom={zoom} />);
}

function railButton(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

describe("ToolRail", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Fails if the rail doesn't report what it covers, or reports only its
  // width: a fit would put a box in the gap between the canvas's edge and
  // the rail, or right against the rail.
  it("reports its left offset, its width, and the same gap again", () => {
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(16);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(48);
    const onInset = vi.fn<(leftInsetPx: number) => void>();

    render(<ToolRail zoom={undefined} onInset={onInset} />);

    expect(onInset).toHaveBeenLastCalledWith(80);
  });

  // Fails if a rail button loses its name or its tooltip, or the rail stops
  // being a toolbar with zoom and fit in order and nothing else: Connect,
  // which the canvas now explains itself, or "Workflows", now the dock's
  // tab, comes back.
  it("is a toolbar of icon buttons, each with a name and a tooltip", () => {
    renderRail();

    const toolbar = screen.getByRole("toolbar", { name: "Tools" });
    const buttons = [...toolbar.querySelectorAll("button")];
    const names = ["Zoom out", "Zoom in", "Fit to screen"];
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
    expect(document.activeElement).toBe(railButton("Fit to screen"));

    fireEvent.keyDown(railButton("Fit to screen"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(railButton("Zoom out"));
  });
});
