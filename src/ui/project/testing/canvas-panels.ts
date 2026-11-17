import { fireEvent, screen, within } from "@testing-library/react";
import type { ShellParts } from "../ProjectFrame";

/** A shell for a project screen rendered on its own: no way back, no hint. */
export const TEST_SHELL: ShellParts = {
  onProjects: () => undefined,
  hint: null,
};

/**
 * The dock's polite region, which says what a remove of a component, an
 * edge, a workflow, or a workload, or a move, did.
 */
export function dockRegion(): HTMLElement {
  const dock = screen.getByRole("region", { name: "Dock" });
  const region = dock.querySelector<HTMLElement>(':scope > [role="status"]');
  if (region == null) throw new Error("No dock region");
  return region;
}

/**
 * Adds a component from the dock's Library tab, showing the tab first if
 * it isn't: clicks the card whose name starts `typeName`.
 */
export function addComponent(typeName: string): void {
  const tab = screen.queryByRole("tab", { name: "Library" });
  if (tab !== null) fireEvent.click(tab);
  const list = screen.getByRole("list", { name: "Component types" });
  const card = within(list).getByRole("button", {
    name: new RegExp(`^${typeName} `),
  });
  fireEvent.click(card);
}

/** The dock's tabs with lists, in the order `revealButton` tries them. */
const LIST_TABS = ["Components", "Workflows", "Workloads"] as const;

/**
 * The button named `name`: where it's showing, or else in the dock's tab
 * that holds it, which this shows. For a test that doesn't care where a
 * button is, such as one that selects a component, then a workflow, then
 * a step in its outline.
 */
export function revealButton(name: string | RegExp): HTMLElement {
  const shown = buttonsNamed(name)[0];
  if (shown !== undefined) return shown;
  for (const tabName of LIST_TABS) {
    const tab = screen.queryByRole("tab", { name: tabName });
    if (tab === null) continue;
    fireEvent.click(tab);
    const row = buttonsNamed(name)[0];
    if (row !== undefined) return row;
  }
  throw new Error(`No button ${String(name)}, shown or in a dock tab`);
}

/** The buttons with the name that are showing. */
function buttonsNamed(name: string | RegExp): HTMLElement[] {
  return screen.queryAllByRole("button", { name });
}
