// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import type { Project, Step } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  renderOpenedProject as renderProject,
  savedRecord,
} from "./testing/render-opened-project";

// The sample's "Read item": 1 API > 1.1 Function > 1.1.1 Table (read). The
// architecture has API → Function and Function → Table, and no API → Table.

function selectStep(text: string): void {
  const row = screen.getByRole("button", { name: /^Read item/ });
  row.focus();
  fireEvent.click(row);
  const outline = screen.getByRole("list", { name: "Steps" });
  fireEvent.click(within(outline).getByRole("button", { name: text }));
}

/** The outline's step buttons' text, in order. */
function outlineText(): string[] {
  const outline = screen.getByRole("list", { name: "Steps" });
  return within(outline)
    .getAllByRole("button")
    .map((button) => button.textContent)
    .filter((text) => /^[0-9]/.test(text));
}

function detailsStatus(): HTMLElement {
  const details = screen.getByRole("tabpanel", { name: "Details" });
  return within(details).getByRole("status");
}

function picker(label: string): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>("combobox", { name: label });
}

function pick(label: string, value: string): void {
  fireEvent.change(picker(label), { target: { value } });
}

function undo(): void {
  fireEvent.click(screen.getByRole("button", { name: /^Undo\b/ }));
}

/** The sample's one workflow with its root replaced. */
function withRoot(root: Step): Project {
  const [read] = sampleRecord.project.workflows;
  if (read === undefined) throw new Error("The sample has a workflow");
  return { ...sampleRecord.project, workflows: [{ ...read, root }] };
}

describe("OpenedProject's changing a workflow's step", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the selected step's pickers don't show what the step is, or
  // a step that isn't selected has them.
  it("shows the selected step's component and action in two pickers", () => {
    renderProject();
    selectStep("1.1.1 Table · read");

    expect(picker("Component").value).toBe("table");
    expect(picker("Action").value).toBe("read");
    expect(screen.getAllByRole("combobox", { name: "Action" })).toHaveLength(1);
  });

  // Fails if choosing an action doesn't save the step with it, keep it
  // selected, announce it, or name Undo for the change.
  it("saves a changed action at once, keeps the step selected, and announces it", async () => {
    const { projects } = renderProject();
    selectStep("1.1.1 Table · read");

    pick("Action", "write");

    expect(outlineText()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Table · write",
    ]);
    expect(
      screen
        .getByRole("button", { name: /^1\.1\.1 Table · write/ })
        .getAttribute("aria-current"),
    ).toBe("true");
    expect(detailsStatus().textContent).toBe(
      "Changed Table · read to Table · write.",
    );
    expect(
      screen.getByRole("button", {
        name: "Undo change Table · read to Table · write",
      }),
    ).toBeTruthy();
    await savedRecord(
      projects,
      (r) =>
        r.project.workflows[0]?.root.calls?.[0]?.calls?.[0]?.action === "write",
    );
  });

  // Fails if a component along a missing edge adds no edge, doesn't say so,
  // leaves its action unchosen when its type accepts only one, or one Undo
  // doesn't put back both the step and the edge.
  it("adds the edge for a component with none from the caller, and undoes both in one step", async () => {
    const { projects } = renderProject();
    selectStep("1.1.1 Table · read");

    pick("Component", "api");

    expect(outlineText()[2]).toBe("1.1.1 API · invoke");
    expect(detailsStatus().textContent).toBe(
      "Changed Table · read to API · invoke. Added the edge from Function to API.",
    );
    expect(screen.getByRole("button", { name: "Function → API" })).toBeTruthy();
    await savedRecord(
      projects,
      (r) => r.project.architecture.edges.length === 3,
    );

    undo();

    expect(screen.queryByRole("button", { name: "Function → API" })).toBeNull();
    expect(outlineText()[2]).toBe("1.1.1 Table · read");
    await savedRecord(
      projects,
      (r) =>
        r.project.architecture.edges.length === 2 &&
        r.project.workflows[0]?.root.calls?.[0]?.calls?.[0]?.action === "read",
    );
  });

  // Fails if a component that doesn't accept the step's action saves before
  // an action is chosen, leaves the action picker holding the old action, or
  // saves with another action than the one chosen.
  it("holds a draft until an action is chosen when the component doesn't accept the step's", async () => {
    const { projects } = renderProject();
    selectStep("1.1 Function · invoke");

    pick("Component", "table");

    expect(outlineText()[1]).toBe("1.1 Function · invoke");
    expect(picker("Action").value).toBe("");
    expect(picker("Component").value).toBe("table");
    expect(
      screen
        .getByRole("button", { name: "Undo" })
        .getAttribute("aria-disabled"),
    ).toBe("true");

    pick("Action", "write");
    // The sample's Function has a call under it, so the change asks first.
    fireEvent.click(screen.getByRole("button", { name: "Change" }));

    expect(outlineText()[1]).toBe("1.1 Table · write");
    expect(picker("Action").value).toBe("write");
    await savedRecord(
      projects,
      (r) => r.project.workflows[0]?.root.calls?.[0]?.componentId === "table",
    );
  });

  // Fails if choosing the step's own component again, while a draft is
  // pending, announces a change that didn't happen, or leaves the draft.
  it("drops the draft without announcing when the step's own component is chosen again", () => {
    renderProject();
    selectStep("1.1 Function · invoke");

    pick("Component", "table");
    pick("Component", "fn");

    expect(picker("Component").value).toBe("fn");
    expect(picker("Action").value).toBe("invoke");
    expect(screen.queryByText(/^Changed /)).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Undo" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });

  // Fails if choosing an accepted action leaves the step's issue, or the
  // workflow's row keeps its problem count.
  it("clears a step's issue when the change fixes it, and the workflow's count with it", () => {
    renderProject({
      project: withRoot({
        id: "api-invoke",
        componentId: "api",
        action: "invoke",
        calls: [{ id: "fn", componentId: "fn", action: "read" }],
      }),
    });
    const row = screen.getByRole("button", { name: "Read item · 1 problem" });
    fireEvent.click(row);
    fireEvent.click(
      screen.getByRole("button", { name: /^1\.1 Function · read/ }),
    );
    expect(picker("Action").value).toBe("");

    pick("Action", "invoke");

    expect(screen.getByRole("button", { name: "Read item" })).toBeTruthy();
    expect(screen.queryByText(/accepts only/)).toBeNull();
  });

  // Fails if a step with async work still has a locked action picker, or a
  // change that drops steps saves before it's confirmed, or the question
  // miscounts the steps (the call and the async work), or the focus isn't on
  // Cancel, or Cancel changes anything or leaves the pickers on the draft.
  it("asks before a change that drops steps, with the focus on Cancel, and Cancel changes nothing", () => {
    renderProject({ project: withStepsUnderFunction() });
    selectStep("1.1 Function · invoke");
    expect(picker("Action").getAttribute("aria-disabled")).toBeNull();

    pick("Component", "table");
    pick("Action", "write");

    const question = screen.getByRole("group", {
      name: "Change Function · invoke to Table · write? The 2 steps under it go.",
    });
    expect(document.activeElement).toBe(
      within(question).getByRole("button", { name: "Cancel" }),
    );
    expect(outlineText()[1]).toBe("1.1 Function · invoke");

    fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("group", { name: /^Change Function/ }),
    ).toBeNull();
    expect(outlineText()).toHaveLength(4);
    expect(picker("Component").value).toBe("fn");
    expect(picker("Action").value).toBe("invoke");
    expect(document.activeElement).toBe(picker("Component"));
    expect(
      screen
        .getByRole("button", { name: "Undo" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });

  // Fails if picking another component while a question is open leaves the
  // question for the earlier choice on screen, so Change still applies it.
  it("drops the question when the pickers move back to the step's own component", () => {
    renderProject({ project: withStepsUnderFunction() });
    selectStep("1.1 Function · invoke");
    pick("Component", "table");
    pick("Action", "write");
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();

    pick("Component", "fn");

    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    expect(outlineText()).toHaveLength(4);
  });

  // Fails if confirming doesn't change the step and drop everything under
  // it, doesn't say how many went, names Undo for less than the whole
  // change, or one Undo doesn't restore the component, the action, and
  // everything under it.
  it("changes the step and drops what's under it on Change, and one Undo restores all", async () => {
    const { projects } = renderProject({ project: withStepsUnderFunction() });
    selectStep("1.1 Function · invoke");
    pick("Component", "table");
    pick("Action", "write");

    fireEvent.click(screen.getByRole("button", { name: "Change" }));

    expect(outlineText()).toEqual(["1 API · invoke", "1.1 Table · write"]);
    expect(detailsStatus().textContent).toBe(
      "Changed Function · invoke to Table · write. Added the edge from API to Table. The 2 steps under it are gone.",
    );
    await savedRecord(
      projects,
      (r) => r.project.workflows[0]?.root.calls?.[0]?.calls === undefined,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Undo change Function · invoke to Table · write, and its edge, and remove the 2 steps under it",
      }),
    );

    expect(outlineText()).toHaveLength(4);
    expect(outlineText()[1]).toBe("1.1 Function · invoke");
  });

  // Fails if a step whose action is enqueue offers "Add a call": its
  // follow-up work is its async work.
  it('offers no "Add a call" under an enqueue', () => {
    renderProject({
      project: withRoot({
        id: "api-invoke",
        componentId: "api",
        action: "invoke",
        calls: [{ id: "enq", componentId: "fn", action: "enqueue" }],
      }),
    });
    selectStep("1.1 Function · enqueue");

    expect(
      screen
        .getAllByRole("button", { name: /^Add a call from/ })
        .map((b) => b.textContent),
    ).toEqual(["Add a call from API"]);
  });
});

/** API > Function (invoke), which has a call to the Table and async work on it. */
function withStepsUnderFunction(): Project {
  return withRoot({
    id: "api-invoke",
    componentId: "api",
    action: "invoke",
    calls: [
      {
        id: "fn",
        componentId: "fn",
        action: "invoke",
        calls: [{ id: "read", componentId: "table", action: "read" }],
        async: { id: "consumer", componentId: "table", action: "read" },
      },
    ],
  });
}
