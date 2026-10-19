// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { applyThemeChoice, savedThemeChoice } from "./theme-choice";
import { ThemeControl } from "./ThemeControl";

const root = document.documentElement;

/** What a page load does: main.tsx applies the saved choice, then renders. */
function loadPage() {
  root.removeAttribute("data-theme");
  applyThemeChoice(savedThemeChoice());
  render(<ThemeControl />);
}

function themeSelect(): HTMLSelectElement {
  return screen.getByLabelText<HTMLSelectElement>("Theme");
}

describe("ThemeControl", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    root.removeAttribute("data-theme");
  });

  // Fails if the control starts on anything but System for a new visitor.
  it("follows the system until the user chooses", () => {
    loadPage();
    expect(themeSelect().value).toBe("system");
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  // Fails if the choice isn't saved, or if the control starts from
  // anything but the saved choice after a reload.
  it("keeps the chosen theme across a reload", () => {
    loadPage();
    fireEvent.change(themeSelect(), { target: { value: "light" } });
    expect(root.getAttribute("data-theme")).toBe("light");

    cleanup();
    loadPage();
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(themeSelect().value).toBe("light");
  });
});
