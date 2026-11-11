import { fireEvent, screen } from "@testing-library/react";
import type { ShellParts } from "../ProjectFrame";

/** A shell for a project screen rendered on its own: no way back, no hint. */
export const TEST_SHELL: ShellParts = {
  onProjects: () => undefined,
  hint: null,
};

/** The canvas's buttons that open its panels. */
export type CanvasPanelButton = "Workflows" | "As text";

/** Opens a canvas panel, unless it's open already, and returns its button. */
export function openPanel(button: CanvasPanelButton): HTMLElement {
  const opener = screen.getByRole("button", { name: button });
  if (opener.getAttribute("aria-expanded") !== "true") fireEvent.click(opener);
  return opener;
}

/** The canvas's panel buttons, in the order `revealButton` tries them. */
const PANEL_BUTTONS: readonly CanvasPanelButton[] = ["As text", "Workflows"];

/**
 * The button named `name`: where it's showing, or else in the canvas panel
 * that holds it, which this opens. For a test that doesn't care which
 * panel a button is in, such as one that selects a component, then a
 * workflow, then a step in Details.
 */
export function revealButton(name: string | RegExp): HTMLElement {
  const shown = screen.queryByRole("button", { name });
  if (shown !== null) return shown;
  for (const panel of PANEL_BUTTONS) {
    if (screen.queryByRole("button", { name: panel }) === null) continue;
    openPanel(panel);
    const found = screen.queryByRole("button", { name });
    if (found !== null) return found;
  }
  throw new Error(`No button ${String(name)}, shown or in a canvas panel`);
}
