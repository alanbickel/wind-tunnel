import { fireEvent, screen, within } from "@testing-library/react";
import type { ShellParts } from "../ProjectFrame";

/** A shell for a project screen rendered on its own: no way back, no hint. */
export const TEST_SHELL: ShellParts = {
  onProjects: () => undefined,
  hint: null,
};

/** The canvas's buttons that open its panels. */
export type CanvasPanelButton = "Workflows" | "Workloads" | "As text";

/**
 * A panel's button. The rail's two are found in its toolbar, since the
 * workflow picker at the bottom left is also named "Workflows" while
 * nothing is selected.
 */
export function panelButton(button: CanvasPanelButton): HTMLElement | null {
  if (button === "As text")
    return screen.queryByRole("button", { name: button });
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
  const shown = buttonsNamed(name)[0];
  if (shown !== undefined) return shown;
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
