import { fireEvent, screen } from "@testing-library/react";
import type { ShellParts } from "../ProjectFrame";

/** A shell for a project screen rendered on its own: no way back, no hint. */
export const TEST_SHELL: ShellParts = {
  onProjects: () => undefined,
  hint: null,
};

/** The canvas's buttons that open its panels. */
export type CanvasPanelButton = "Workflows" | "Workloads" | "As text";

/** Opens a canvas panel, unless it's open already, and returns its button. */
export function openPanel(button: CanvasPanelButton): HTMLElement {
  const opener = screen.getByRole("button", { name: button });
  if (opener.getAttribute("aria-expanded") !== "true") fireEvent.click(opener);
  return opener;
}

/**
 * The tool rail's polite regions, which sit beside its toolbar: what a
 * component's remove or a move says ("component"), and what a workflow's or
 * a workload's remove says ("list").
 */
export function railRegion(which: "component" | "list"): HTMLElement {
  const rail = screen.getByRole("toolbar", { name: "Tools" }).parentElement;
  const regions = rail?.querySelectorAll<HTMLElement>('[role="status"]');
  const region = regions?.[which === "component" ? 0 : 1];
  if (region === undefined) throw new Error(`No ${which} region on the rail`);
  return region;
}

/** The canvas's panel buttons, in the order `revealButton` tries them. */
const PANEL_BUTTONS: readonly CanvasPanelButton[] = [
  "As text",
  "Workflows",
  "Workloads",
];

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
