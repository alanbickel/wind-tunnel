// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyThemeChoice,
  chooseTheme,
  savedThemeChoice,
  toThemeChoice,
} from "./theme-choice";

const root = document.documentElement;

describe("theme choice", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    root.removeAttribute("data-theme");
  });

  // Fails if chooseTheme only changes the page, or only saves.
  it("shows and saves a fixed theme", () => {
    chooseTheme("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(savedThemeChoice()).toBe("dark");
  });

  // Fails if choosing System leaves the old theme on the page or saved,
  // so the page wouldn't follow the operating system.
  it("follows the system again when System is chosen", () => {
    chooseTheme("light");
    chooseTheme("system");
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(savedThemeChoice()).toBe("system");
  });

  // Fails if applying a choice at startup also saves it.
  it("applies a choice without saving it", () => {
    applyThemeChoice("light");
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(localStorage.length).toBe(0);
  });

  // Fails if a stale or hand-edited saved value reaches data-theme.
  it.each(["", "blue", "Dark", null])("reads %j as System", (value) => {
    expect(toThemeChoice(value)).toBe("system");
  });

  // Fails if blocked storage throws at startup, which would stop the app
  // rendering.
  it("treats blocked storage as nothing saved", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(savedThemeChoice()).toBe("system");
  });

  // Fails if a failed save stops the theme changing on the page.
  it("still shows the theme when it can't be saved", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    chooseTheme("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
  });
});
