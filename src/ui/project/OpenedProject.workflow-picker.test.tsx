// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { openPanel } from "./testing/canvas-panels";
import {
  detailsHeading,
  queryDetailsHeading,
  renderOpenedProject as renderProject,
} from "./testing/render-opened-project";

/** The picker's button: the only one with a menu. */
function pickerButton(): HTMLElement {
  const button = document.querySelector<HTMLElement>('[aria-haspopup="menu"]');
  if (button === null) throw new Error("No workflow picker");
  return button;
}

function openMenu(): HTMLElement {
  fireEvent.click(pickerButton());
  return screen.getByRole("menu", { name: "Workflows" });
}

/** The menu's items, by what they say and whether they're checked. */
function items(menu: HTMLElement): [string | null, string | null][] {
  return within(menu)
    .getAllByRole("menuitemradio")
    .map((item) => [item.textContent, item.getAttribute("aria-checked")]);
}

function pick(name: string): void {
  const item = within(openMenu()).getByRole("menuitemradio", { name });
  fireEvent.click(item);
}

describe("OpenedProject's workflow picker", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the button stops saying "Workflows" with none selected, or
  // the menu offers anything but a radio item per workflow, all unchecked.
  it("says Workflows with none selected, and offers every workflow unchecked", () => {
    renderProject();

    expect(pickerButton().textContent).toContain("Workflows");
    expect(pickerButton().getAttribute("aria-expanded")).toBe("false");
    const menu = openMenu();
    expect(pickerButton().getAttribute("aria-expanded")).toBe("true");
    expect(items(menu).map(([, checked]) => checked)).toEqual(["false"]);
  });

  // Fails if picking a workflow doesn't select it, the focus doesn't move to
  // the inspector's heading, the button doesn't show the workflow, or the
  // menu stays open.
  it("selects a workflow, moves the focus to the heading, and shows its name", () => {
    renderProject();

    pick("Read item");

    expect(detailsHeading().textContent).toBe("Read item · Workflow");
    expect(document.activeElement).toBe(detailsHeading());
    expect(pickerButton().textContent).toContain("Read item");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  // Fails if the checked item is only a color, or doesn't follow a selection
  // made elsewhere: the list's row, or a step in the outline.
  it("checks the workflow selected elsewhere, a step in it included", () => {
    renderProject();
    openPanel("Workflows");
    const list = screen.getByRole("list", { name: "Workflows" });

    fireEvent.click(within(list).getByRole("button", { name: "Read item" }));
    expect(
      items(openMenu()).filter(([, checked]) => checked === "true"),
    ).toEqual([["✓Read item", "true"]]);

    fireEvent.click(
      screen.getByRole("button", { name: "1.1 Function · invoke" }),
    );
    // Selecting moved the focus out of the menu, which closed it.
    expect(
      items(openMenu()).filter(([, checked]) => checked === "true"),
    ).toEqual([["✓Read item", "true"]]);
  });

  // Fails if "Clear selection" leaves the workflow selected, or the button
  // keeps its name.
  it("clears the selection from the menu", () => {
    renderProject();
    pick("Read item");

    fireEvent.click(
      within(openMenu()).getByRole("menuitem", { name: "Clear selection" }),
    );

    expect(queryDetailsHeading()).toBeNull();
    expect(pickerButton().textContent).toContain("Workflows");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  // Fails if Escape leaves the menu open, or the focus in the closed menu
  // instead of on its button, or Escape reaches a panel behind it.
  it("closes on Escape and returns the focus to its button", () => {
    renderProject();
    const menu = openMenu();
    const [first] = within(menu).getAllByRole("menuitemradio");

    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first as HTMLElement, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(pickerButton());
  });

  // Fails if the arrow keys don't move through the items, wrapping at the
  // ends, or Home and End stop jumping.
  it("moves through its items with the arrow keys", () => {
    renderProject();
    const menu = openMenu();
    const all = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
    const focused = () => all.findIndex((i) => i === document.activeElement);

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(focused()).toBe(1);
    fireEvent.keyDown(menu, { key: "End" });
    expect(focused()).toBe(all.length - 1);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(focused()).toBe(0);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(focused()).toBe(all.length - 1);
    fireEvent.keyDown(menu, { key: "Home" });
    expect(focused()).toBe(0);
  });

  // Fails if the arrow key on the closed button opens the menu without
  // focusing an item, or the button needs a click.
  it("opens from its button with the arrow key", () => {
    renderProject();

    fireEvent.keyDown(pickerButton(), { key: "ArrowDown" });

    expect(screen.getByRole("menu")).toBeTruthy();
    expect(document.activeElement?.getAttribute("role")).toBe("menuitemradio");
  });

  // Fails if focus leaving the picker, such as a click elsewhere, leaves the
  // menu open over the canvas.
  it("closes when the focus leaves it", () => {
    renderProject();
    openMenu();

    fireEvent.blur(screen.getByRole("menuitemradio", { name: "Read item" }), {
      relatedTarget: document.body,
    });

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
