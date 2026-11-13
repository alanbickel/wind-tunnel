// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { applyThemeChoice, savedThemeChoice } from "../theme/theme-choice";
import { SettingsMenu } from "./SettingsMenu";

const root = document.documentElement;

/** What a page load does: main.tsx applies the saved choice, then renders. */
function loadPage() {
  root.removeAttribute("data-theme");
  applyThemeChoice(savedThemeChoice());
  render(<SettingsMenu />);
}

function settingsButton(): HTMLElement {
  return screen.getByRole("button", { name: "Settings" });
}

function openMenu() {
  fireEvent.click(settingsButton());
}

function themeItem(name: string): HTMLElement {
  return screen.getByRole("menuitemradio", { name });
}

describe("SettingsMenu", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    root.removeAttribute("data-theme");
  });

  // Fails if the menu starts open, or opens without the button.
  it("opens a Theme menu from the Settings button", () => {
    loadPage();
    expect(screen.queryByRole("menu")).toBeNull();

    openMenu();

    expect(screen.getByRole("menu", { name: "Theme" })).toBeTruthy();
    expect(settingsButton().getAttribute("aria-expanded")).toBe("true");
  });

  // Fails if the menu starts on anything but System for a new visitor.
  it("follows the system until the user chooses", () => {
    loadPage();
    openMenu();

    expect(themeItem("System").getAttribute("aria-checked")).toBe("true");
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  // Fails if the choice isn't saved, or if the menu starts from anything
  // but the saved choice after a reload.
  it("keeps the chosen theme across a reload", () => {
    loadPage();
    openMenu();
    fireEvent.click(themeItem("Light"));
    expect(root.getAttribute("data-theme")).toBe("light");

    cleanup();
    loadPage();
    openMenu();
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(themeItem("Light").getAttribute("aria-checked")).toBe("true");
    expect(themeItem("System").getAttribute("aria-checked")).toBe("false");
  });

  // Fails if picking leaves the menu open, or drops the keyboard focus
  // with the item that went.
  it("closes on a pick and returns the focus to the button", () => {
    loadPage();
    openMenu();

    fireEvent.click(themeItem("Dark"));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(settingsButton());
  });

  // Fails if the menu doesn't open on the checked item, or Escape doesn't
  // close it and return the focus.
  it("opens on the checked item, and Escape closes it", () => {
    loadPage();
    openMenu();
    expect(document.activeElement).toBe(themeItem("System"));

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(settingsButton());
  });

  // Fails if the arrow keys don't move through the items, wrapping at
  // the ends, or Home and End don't jump.
  it("moves through the items with the arrow keys, Home, and End", () => {
    loadPage();
    openMenu();
    const menu = screen.getByRole("menu");

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(themeItem("Dark"));
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(themeItem("Light"));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(themeItem("System"));
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(themeItem("Light"));
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(themeItem("System"));
  });

  // Fails if the focus leaving the menu leaves it open over the page.
  it("closes when the focus leaves it", () => {
    loadPage();
    openMenu();

    fireEvent.blur(themeItem("System"), { relatedTarget: document.body });

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
