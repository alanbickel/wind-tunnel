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
  // The cards are in one list per category, each named by its h4 (other
  // h4s, such as Details', name no list).
  const card = screen
    .getAllByRole("heading", { level: 4 })
    .flatMap((heading) =>
      screen.queryAllByRole("list", { name: heading.textContent }),
    )
    .flatMap((list) =>
      within(list).queryAllByRole("button", {
        name: new RegExp(`^${typeName} `),
      }),
    )
    .at(0);
  if (card === undefined) throw new Error(`No card for ${typeName}`);
  fireEvent.click(card);
}

/**
 * Removes a workload as a user does: selects it from the Workloads tab,
 * presses Details' Remove, and confirms.
 */
export function removeWorkload(name: string): void {
  const row = revealButton(name);
  row.focus();
  fireEvent.click(row);
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  const asking = screen.getByRole("group", { name: `Remove ${name}?` });
  fireEvent.click(within(asking).getByRole("button", { name: "Remove" }));
}

/** Presses the top bar's Undo. */
export function pressUndo(): void {
  const bar = screen.getByRole("banner");
  fireEvent.click(within(bar).getByRole("button", { name: /^Undo\b/ }));
}

/** The dock's tabs with lists, in the order `revealButton` tries them. */
const LIST_TABS = ["Components", "Workflows", "Workloads"] as const;

/**
 * The dock's button named `name`: in the tab that's showing, or else in the
 * list tab that holds it, which this shows. For a test that doesn't care
 * which tab a row is in, such as one that selects a component, then a
 * workflow, then a step in its outline. It searches the dock's panels
 * alone, one at a time: a query of the whole screen costs the name of every
 * button on it.
 */
export function revealButton(name: string | RegExp): HTMLElement {
  const dock = screen.getByRole("region", { name: "Dock" });
  const selected = within(dock).queryByRole("tab", { selected: true });
  const shown = selected === null ? undefined : buttonInPanel(selected, name);
  if (shown !== undefined) return shown;
  for (const tabName of LIST_TABS) {
    const tab = within(dock).queryByRole("tab", { name: tabName });
    if (tab === null) continue;
    fireEvent.click(tab);
    const row = buttonInPanel(tab, name);
    if (row !== undefined) return row;
  }
  throw new Error(`No button ${String(name)} in the dock's tabs`);
}

/** The first button with the name in the panel a tab shows. */
function buttonInPanel(
  tab: HTMLElement,
  name: string | RegExp,
): HTMLElement | undefined {
  const panelId = tab.getAttribute("aria-controls");
  const panel = panelId === null ? null : document.getElementById(panelId);
  if (panel === null) throw new Error(`Tab ${tab.textContent} has no panel`);
  return within(panel).queryAllByRole("button", { name })[0];
}
