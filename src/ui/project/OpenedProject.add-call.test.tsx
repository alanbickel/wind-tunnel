// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  detailsHeading,
  renderOpenedProject as renderProject,
  savedRecord,
} from "./testing/render-opened-project";

// The sample's "Read item": 1 API > 1.1 Function > 1.1.1 Table (read). The
// architecture has API → Function and Function → Table, and no API → Table.

import { revealButton } from "./testing/canvas-panels";

function openOutline(): void {
  const row = revealButton(/^Read item/);
  row.focus();
  fireEvent.click(row);
}

/** The outline's step buttons' text, in order. */
function outlineText(): string[] {
  const outline = screen.getByRole("list", { name: "Steps" });
  return within(outline)
    .getAllByRole("button")
    .map((button) => button.textContent)
    .filter((text) => /^[0-9]/.test(text));
}

/** The status region in Details. */
function detailsStatus(): HTMLElement {
  const details = screen.getByRole("region", { name: "Details" });
  return within(details).getByRole("status");
}

/** Opens a step's draft call. */
function addCallFrom(step: string): void {
  const button = screen.getByRole("button", { name: step });
  button.focus();
  fireEvent.click(button);
}

function pick(label: string, value: string): void {
  fireEvent.change(screen.getByRole("combobox", { name: label }), {
    target: { value },
  });
}

function undo(): void {
  fireEvent.click(screen.getByRole("button", { name: /^Undo\b/ }));
}

describe("OpenedProject's adding a call to a workflow's step", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the component picker lists a component the caller has no edge
  // to (the API has none to the Table), or leaves out one it has; or the
  // action picker is there before a component is chosen; or opening the
  // draft doesn't move the focus to the component picker (it would fall to
  // the page's body, out of reach of Escape).
  it("lists only the components the caller has an edge to", () => {
    renderProject();
    openOutline();
    addCallFrom("Add a call from API, step 1");

    const picker = screen.getByRole("combobox", { name: "Component" });
    expect(document.activeElement).toBe(picker);
    expect(
      within(picker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Choose a component", "Function (Lambda)"]);
    expect(screen.queryByRole("combobox", { name: "Action" })).toBeNull();
  });

  // Fails if a caller with no edge out gets pickers with nothing to pick,
  // or the draft doesn't say why and how to connect it (a call never adds
  // an edge, so the words are the way out); or the draft doesn't take the
  // focus (it would fall to the body, and Escape couldn't reach the group);
  // or the group isn't described by the note (a screen reader would say
  // nothing of why there is no picker); or Escape from the group doesn't
  // drop the draft and return the focus to its button.
  it("says how to connect a caller that has no edge to call along", () => {
    renderProject();
    openOutline();

    addCallFrom("Add a call from Table, step 1.1.1");

    expect(screen.queryByRole("combobox", { name: "Component" })).toBeNull();
    const group = screen.getByRole("group", { name: /^Add a call/ });
    expect(group.textContent).toContain("Table has no edges to call along.");
    expect(group.textContent).toContain("Connect to…");
    expect(document.activeElement).toBe(group);
    expect(group.getAttribute("aria-describedby")).toBe(
      screen.getByText(/has no edges to call along/).id,
    );

    fireEvent.keyDown(group, { key: "Escape" });

    expect(screen.queryByRole("group", { name: /^Add a call/ })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Add a call from Table, step 1.1.1" }),
    );
  });

  // Fails if a component whose type accepts one action doesn't have it
  // chosen at once (the call would wait for a picker with one option), or
  // the call isn't saved as the caller's last, selected, announced, and
  // named for Undo; or the focus doesn't land on the new step's line.
  it("saves a call on a component with one action at once, selects it, and announces it", async () => {
    const { projects } = renderProject();
    openOutline();
    addCallFrom("Add a call from API, step 1");

    pick("Component", "fn");

    expect(outlineText()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Table · read",
      "1.2 Function · invoke",
    ]);
    const added = screen.getByRole("button", { name: /^1\.2 Function/ });
    expect(added.getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(added);
    expect(detailsStatus().textContent).toBe(
      "Added a call from API to Function.",
    );
    expect(
      screen.getByRole("button", {
        name: "Undo add a call from API to Function",
      }),
    ).toBeTruthy();
    const saved = await savedRecord(
      projects,
      (r) => r.project.workflows[0]?.root.calls?.length === 2,
    );
    expect(saved.project.architecture.edges).toHaveLength(2);
    expect(screen.queryByRole("group", { name: /^Add a call/ })).toBeNull();
  });

  // Fails if a component with several actions saves before one is chosen,
  // or saves with another action than the one chosen.
  it("waits for an action when the component accepts several", async () => {
    const { projects } = renderProject();
    openOutline();
    addCallFrom("Add a call from Function, step 1.1");

    pick("Component", "table");

    expect(outlineText()).toHaveLength(3);
    pick("Action", "write");

    expect(outlineText()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Table · read",
      "1.1.2 Table · write",
    ]);
    const saved = await savedRecord(
      projects,
      (r) => r.project.workflows[0]?.root.calls?.[0]?.calls?.length === 2,
    );
    expect(saved.project.architecture.edges).toHaveLength(2);
  });

  // Fails if a call adds an edge (the architecture keeps its two), or
  // Undo's name or the announcement says anything of one, or one Undo
  // leaves the call behind.
  it("adds a call along an existing edge, names it, and undoes it, with no edge added", async () => {
    const { projects } = renderProject();
    openOutline();
    addCallFrom("Add a call from Function, step 1.1");

    pick("Component", "table");
    pick("Action", "write");

    expect(detailsStatus().textContent).toBe(
      "Added a call from Function to Table.",
    );
    expect(
      screen.getByRole("button", {
        name: "Undo add a call from Function to Table",
      }),
    ).toBeTruthy();
    const saved = await savedRecord(
      projects,
      (r) => r.project.workflows[0]?.root.calls?.[0]?.calls?.length === 2,
    );
    expect(saved.project.architecture.edges).toHaveLength(2);

    undo();

    openOutline();
    expect(outlineText()).toHaveLength(3);
    await savedRecord(
      projects,
      (r) => r.project.workflows[0]?.root.calls?.[0]?.calls?.length === 1,
    );
  });

  // Fails if Escape saves anything, leaves the draft open, closes Details
  // instead (the outline would go with it), or loses the focus from the
  // button that opened the draft.
  it("drops the draft on Escape, saves nothing, and returns the focus to the button", () => {
    renderProject();
    openOutline();
    addCallFrom("Add a call from Function, step 1.1");
    pick("Component", "table");

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Action" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("group", { name: /^Add a call/ })).toBeNull();
    expect(outlineText()).toHaveLength(3);
    expect(
      screen
        .getByRole("button", { name: "Undo" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(detailsHeading().textContent).toBe("Read item · Workflow");
    expect(document.activeElement).toBe(
      screen.getByRole("button", {
        name: "Add a call from Function, step 1.1",
      }),
    );
  });

  // Fails if undoing an add leaves the new step selected (it's gone, so
  // Details would describe a step the workflow doesn't have), or the
  // outline keeps the step.
  it("undoes a call that adds no edge, and clears the selection that was on it", () => {
    renderProject();
    openOutline();
    addCallFrom("Add a call from API, step 1");
    pick("Component", "fn");

    undo();

    expect(screen.queryByRole("list", { name: "Steps" })).toBeNull();
    openOutline();
    expect(outlineText()).toHaveLength(3);
  });
});
