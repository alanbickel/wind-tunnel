import { fireEvent, screen, within } from "@testing-library/react";
import type { ShellParts } from "../ProjectFrame";

/** A shell for a project screen rendered on its own: no way back, no hint. */
export const TEST_SHELL: ShellParts = {
  onProjects: () => undefined,
  hint: null,
};

/** The canvas's buttons that open its panels. */
export type CanvasPanelButton = "Workflows" | "Workloads";

/**
 * A panel's button, found in the rail's toolbar, since the workflow picker
 * at the bottom left is also named "Workflows" while nothing is selected.
 */
export function panelButton(button: CanvasPanelButton): HTMLElement | null {
  const rail = screen.queryByRole("toolbar", { name: "Tools" });
  return rail && within(rail).queryByRole("button", { name: button });
}

/** Opens a canvas panel, unless it's open already, and returns its button. */
export function openPanel(button: CanvasPanelButton): HTMLElement {
  const opener = panelButton(button);
  if (opener === null) throw new Error(`No ${button} button`);
  if (opener.getAttribute("aria-expanded") !== "true") fireEvent.click(opener);
  return opener;
}

/**
 * The polite regions: the dock's, which says what a component's or an
 * edge's remove or a move did ("component"), and the tool rail's, beside
 * its toolbar, which says what a workflow's or a workload's remove did
 * ("list").
 */
export function railRegion(which: "component" | "list"): HTMLElement {
  const parent =
    which === "component"
      ? screen.getByRole("region", { name: "Dock" })
      : screen.getByRole("toolbar", { name: "Tools" }).parentElement;
  const region = parent?.querySelector<HTMLElement>('[role="status"]');
  if (region == null) throw new Error(`No ${which} region`);
  return region;
}

/** The canvas's panel buttons, in the order `revealButton` tries them. */
const PANEL_BUTTONS: readonly CanvasPanelButton[] = ["Workflows", "Workloads"];

/**
 * The button named `name`: where it's showing, or else in the canvas panel
 * that holds it, which this opens. For a test that doesn't care which
 * panel a button is in, such as one that selects a component, then a
 * workflow, then a step in Details.
 */
export function revealButton(name: string | RegExp): HTMLElement {
  const shown = buttonsNamed(name)[0];
  if (shown !== undefined) return shown;
  const components = screen.queryByRole("tab", { name: "Components" });
  if (components !== null) {
    fireEvent.click(components);
    const row = buttonsNamed(name)[0];
    if (row !== undefined) return row;
  }
  for (const panel of PANEL_BUTTONS) {
    if (panelButton(panel) === null) continue;
    openPanel(panel);
    const found = buttonsNamed(name)[0];
    if (found !== undefined) return found;
  }
  throw new Error(`No button ${String(name)}, shown or in a canvas panel`);
}

/**
 * The buttons with the name, but the workflow picker's, which shows the
 * selected workflow's name, as that workflow's row in the list does.
 */
function buttonsNamed(name: string | RegExp): HTMLElement[] {
  return screen
    .queryAllByRole("button", { name })
    .filter((button) => !button.hasAttribute("aria-haspopup"));
}
