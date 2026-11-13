// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { revealButton } from "./testing/canvas-panels";
import { renderOpenedProject as renderProject } from "./testing/render-opened-project";

function openSteady(): void {
  const row = revealButton("Steady");
  row.focus();
  fireEvent.click(row);
}

function dock(): HTMLElement | null {
  return screen.queryByRole("region", { name: "Workload dock" });
}

describe("OpenedProject's workload dock", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the dock shows with nothing selected, or a workload doesn't
  // open in it.
  it("shows the dock only while a workload is selected", () => {
    renderProject();
    expect(dock()).toBeNull();

    openSteady();

    const open = dock();
    expect(open).not.toBeNull();
    expect(
      within(open as HTMLElement).getByRole("heading", { level: 4 })
        .textContent,
    ).toBe("Steady · Workload");
  });

  // Fails if the workload's editor stays in the inspector's Details too, or
  // the inspector doesn't close when a workload opens (UX §5).
  it("closes the inspector, and leaves the workload out of Details", () => {
    renderProject();
    const toggle = screen.getByRole("button", { name: "Close the inspector" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    openSteady();

    expect(
      screen
        .getByRole("button", { name: "Open the inspector" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      screen.queryAllByRole("heading", { level: 4, name: /· Workload$/ }),
    ).toHaveLength(1);
  });

  // Fails if Fold doesn't hide the editor and keep the Unfold button, or
  // folding drops the editor so a draft would be lost.
  it("folds to one line and unfolds with the editor still mounted", () => {
    renderProject();
    openSteady();
    const open = dock() as HTMLElement;

    fireEvent.click(
      within(open).getByRole("button", { name: "Fold the dock" }),
    );

    const unfold = within(open).getByRole("button", {
      name: "Unfold the dock",
    });
    expect(unfold.getAttribute("aria-expanded")).toBe("false");
    expect(
      within(open).queryByRole("textbox", { name: "Duration" }),
    ).toBeNull();
    fireEvent.click(unfold);
    expect(
      within(open).getByRole("textbox", { name: "Duration" }),
    ).toBeTruthy();
  });

  // Fails if Escape leaves the dock open.
  it("closes on Escape", () => {
    renderProject();
    openSteady();

    fireEvent.keyDown(
      within(dock() as HTMLElement).getByRole("heading", { level: 4 }),
      { key: "Escape" },
    );

    expect(dock()).toBeNull();
  });
});
