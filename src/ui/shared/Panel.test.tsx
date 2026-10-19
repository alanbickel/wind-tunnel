// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Panel } from "./Panel";

describe("Panel", () => {
  afterEach(cleanup);

  // Fails if a panel that scrolls has no tab stop: a keyboard user couldn't
  // scroll to content between its controls, such as a table.
  it("takes a tab stop when it scrolls, so the keyboard can scroll it", () => {
    render(
      <Panel heading="Run" scrolls>
        <p>Totals</p>
      </Panel>,
    );

    expect(screen.getByRole("region", { name: "Run" }).tabIndex).toBe(0);
  });

  // Fails if every panel takes a tab stop, adding one that does nothing to
  // panels that never scroll.
  it("takes no tab stop when it doesn't scroll", () => {
    render(
      <Panel heading="Notes">
        <p>Text</p>
      </Panel>,
    );

    const panel = screen.getByRole("region", { name: "Notes" });
    expect(panel.hasAttribute("tabindex")).toBe(false);
  });
});
