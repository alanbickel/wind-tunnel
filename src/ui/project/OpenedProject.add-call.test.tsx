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

function openOutline(): void {
  const row = screen.getByRole("button", { name: /^Read item/ });
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
  const details = screen.getByRole("tabpanel", { name: "Details" });
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

  // Fails if the component picker lists the caller's own component, puts a
  // component with no edge from the caller before its neighbours, or
  // doesn't mark each of those as adding an edge; or the action picker is
  // there before a component is chosen; or opening the draft doesn't move
  // the focus to the component picker (it would fall to the page's body,
  // out of reach of Escape).
  it("lists the caller's neighbours first, and marks the others as adding an edge", () => {
    renderProject();
    openOutline();
    addCallFrom("Add a call from API, step 1");

    const picker = screen.getByRole("combobox", { name: "Component" });
    expect(document.activeElement).toBe(picker);
    expect(
      within(picker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Choose a component",
      "Function (Lambda)",
      "Table (DynamoDB) · No edge from API yet; choosing it adds one.",
    ]);
    expect(screen.queryByRole("combobox", { name: "Action" })).toBeNull();
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

  // Fails if a call along a missing edge doesn't add the edge in the same
  // save, the edge isn't on the diagram's text version, or isn't announced,
  // or Undo's name leaves out the edge, or one Undo leaves either behind.
  it("adds the edge with a call along a missing one, announces it, and undoes both in one step", async () => {
    const { projects } = renderProject();
    openOutline();
    addCallFrom("Add a call from API, step 1");

    pick("Component", "table");
    pick("Action", "write");

    expect(detailsStatus().textContent).toBe(
      "Added a call from API to Table. Added the edge from API to Table.",
    );
    expect(screen.getByRole("button", { name: "API → Table" })).toBeTruthy();
    const saved = await savedRecord(
      projects,
      (r) => r.project.architecture.edges.length === 3,
    );
    expect(saved.project.architecture.edges.at(-1)).toMatchObject({
      from: "api",
      to: "table",
      timeoutMs: 29_000,
    });

    undo();

    expect(screen.queryByRole("button", { name: "API → Table" })).toBeNull();
    openOutline();
    expect(outlineText()).toHaveLength(3);
    await savedRecord(
      projects,
      (r) =>
        r.project.architecture.edges.length === 2 &&
        r.project.workflows[0]?.root.calls?.length === 1,
    );
  });

  // Fails if Undo's name leaves out the edge the call added.
  it("names Undo for both the call and its edge", () => {
    renderProject();
    openOutline();
    addCallFrom("Add a call from API, step 1");

    pick("Component", "table");
    pick("Action", "write");

    expect(
      screen.getByRole("button", {
        name: "Undo add a call from API to Table, and its edge",
      }),
    ).toBeTruthy();
  });

  // Fails if Escape saves anything, leaves the draft open, closes Details
  // instead (the outline would go with it), or loses the focus from the
  // button that opened the draft.
  it("drops the draft on Escape, saves nothing, and returns the focus to the button", () => {
    renderProject();
    openOutline();
    addCallFrom("Add a call from API, step 1");
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
      screen.getByRole("button", { name: "Add a call from API, step 1" }),
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
