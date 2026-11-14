// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import type { Project, Step } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  detailsHeading,
  renderOpenedProject as renderProject,
  savedRecord,
} from "./testing/render-opened-project";

import { revealButton } from "./testing/canvas-panels";

const [read] = sampleRecord.project.workflows;
if (read === undefined) throw new Error("The sample has a workflow");

const tableRead: Step = {
  id: "table-read",
  componentId: "table",
  action: "read",
};
const tableWrite: Step = {
  id: "table-write",
  componentId: "table",
  action: "write",
};

/** "Read item": API > Function > [Table read, Table write]. */
const twoCalls: Project = {
  ...sampleRecord.project,
  workflows: [
    {
      ...read,
      root: {
        id: "api-invoke",
        componentId: "api",
        action: "invoke",
        calls: [
          {
            id: "fn-invoke",
            componentId: "fn",
            action: "invoke",
            calls: [tableRead, tableWrite],
          },
        ],
      },
    },
  ],
};

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

function button(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

/** The status region in Details. */
function detailsStatus(): HTMLElement {
  const details = screen.getByRole("region", { name: "Details" });
  return within(details).getByRole("status");
}

function undo(): void {
  fireEvent.click(screen.getByRole("button", { name: /^Undo\b/ }));
}

function confirming(question: string): HTMLElement {
  return screen.getByRole("group", { name: question });
}

describe("OpenedProject's moving and removing a workflow's steps", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if Move down doesn't reorder the outline and the saved record,
  // loses the focus from the Move down it was pressed on (a step keyed by
  // its place, not its id, would leave it on its neighbour's), doesn't
  // announce "Moved … down." from Details' region, or names Undo wrongly.
  it("moves a step down, keeps the focus on its button, announces, and saves", async () => {
    const { projects } = renderProject({ project: twoCalls });
    openOutline();
    const status = detailsStatus();

    const down = button("Move down 1.1.1 Table · read");
    down.focus();
    fireEvent.click(down);

    expect(outlineText()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Table · write",
      "1.1.2 Table · read",
    ]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Move down 1.1.2 Table · read",
    );
    expect(detailsStatus()).toBe(status);
    expect(status.textContent).toBe("Moved Table · read down.");
    expect(button("Undo move Table · read down")).toBeTruthy();
    const saved = await savedRecord(
      projects,
      (r) =>
        r.project.workflows[0]?.root.calls?.[0]?.calls?.[0]?.id ===
        "table-write",
    );
    expect(saved.project.architecture).toEqual(twoCalls.architecture);
  });

  // Fails if Move up at the top, or Move down at the bottom, isn't
  // aria-disabled, or does something when pressed, or a step with no
  // siblings has move buttons.
  it("makes Move up at the top and Move down at the bottom unusable", () => {
    renderProject({ project: twoCalls });
    openOutline();

    const up = button("Move up 1.1.1 Table · read");
    const down = button("Move down 1.1.2 Table · write");
    expect(up.getAttribute("aria-disabled")).toBe("true");
    expect(down.getAttribute("aria-disabled")).toBe("true");
    expect(
      button("Move down 1.1.1 Table · read").getAttribute("aria-disabled"),
    ).toBe("false");
    fireEvent.click(up);
    fireEvent.click(down);

    expect(outlineText()[2]).toBe("1.1.1 Table · read");
    expect(detailsStatus().textContent).toBe("");
    expect(screen.queryByRole("button", { name: /^Move .* 1\.1 / })).toBeNull();
  });

  // Fails if a step with no steps under it asks first, doesn't go, doesn't
  // select its caller and put the focus on its line, or doesn't announce
  // "Removed …".
  it("removes a step with nothing under it at once, and selects its caller", async () => {
    const { projects } = renderProject({ project: twoCalls });
    openOutline();

    fireEvent.click(button("Remove 1.1.2 Table · write"));

    expect(screen.queryByRole("group", { name: /^Remove / })).toBeNull();
    expect(outlineText()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Table · read",
    ]);
    const caller = screen.getByRole("button", { name: /^1\.1 Function/ });
    expect(caller.getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(caller);
    expect(detailsHeading().textContent).toBe("Read item · Workflow");
    expect(detailsStatus().textContent).toBe("Removed Table · write.");
    await savedRecord(
      projects,
      (r) => r.project.workflows[0]?.root.calls?.[0]?.calls?.length === 1,
    );
  });

  // Fails if a step with calls goes without asking, the question doesn't
  // count the steps under it, the focus isn't on Cancel, or Cancel or
  // Escape removes anything or loses the focus on Remove.
  it("asks before removing a step with calls, counts them, and keeps it on Cancel", () => {
    renderProject({ project: twoCalls });
    openOutline();
    fireEvent.click(button("Remove 1.1 Function · invoke"));

    const question = confirming(
      "Remove Function · invoke and the 2 calls under it?",
    );
    const cancel = within(question).getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);

    expect(screen.queryByRole("group", { name: /^Remove / })).toBeNull();
    expect(outlineText()).toHaveLength(4);
    expect(document.activeElement).toBe(button("Remove 1.1 Function · invoke"));
    fireEvent.click(button("Remove 1.1 Function · invoke"));
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(screen.queryByRole("group", { name: /^Remove / })).toBeNull();
    expect(outlineText()).toHaveLength(4);
  });

  // Fails if confirming doesn't take the step and every step under it,
  // doesn't select its caller with the focus on its line, or an undo
  // doesn't put all three steps back at their place in one step.
  it("removes a step with the calls under it on confirm, and undo puts them back", async () => {
    const { projects } = renderProject({ project: twoCalls });
    openOutline();
    fireEvent.click(button("Remove 1.1 Function · invoke"));

    fireEvent.click(
      within(
        confirming("Remove Function · invoke and the 2 calls under it?"),
      ).getByRole("button", { name: "Remove" }),
    );

    expect(outlineText()).toEqual(["1 API · invoke"]);
    const caller = screen.getByRole("button", { name: /^1 API/ });
    expect(document.activeElement).toBe(caller);
    expect(detailsStatus().textContent).toBe("Removed Function · invoke.");
    undo();
    expect(outlineText()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Table · read",
      "1.1.2 Table · write",
    ]);
    const saved = await savedRecord(
      projects,
      (r) => r.project.workflows[0]?.root.calls !== undefined,
    );
    expect(saved.project.workflows).toEqual(twoCalls.workflows);
  });

  // Fails if undoing a move doesn't put the step back where it was, in
  // one step.
  it("undoes a move", () => {
    renderProject({ project: twoCalls });
    openOutline();
    fireEvent.click(button("Move down 1.1.1 Table · read"));

    undo();

    expect(outlineText()[2]).toBe("1.1.1 Table · read");
    expect(outlineText()).toHaveLength(4);
  });

  // Fails if removing a step with an issue leaves the issue in the
  // outline, or the workflow's row still counts it.
  it("clears a removed step's issues, and the row's count", () => {
    const broken: Step = { id: "bad", componentId: "api", action: "invoke" };
    const [workflow] = twoCalls.workflows;
    if (workflow === undefined) throw new Error("twoCalls has a workflow");
    const fn = workflow.root.calls?.[0];
    if (fn === undefined) throw new Error("twoCalls has a function step");
    const project: Project = {
      ...twoCalls,
      workflows: [
        {
          ...workflow,
          root: {
            ...workflow.root,
            calls: [{ ...fn, calls: [...(fn.calls ?? []), broken] }],
          },
        },
      ],
    };
    renderProject({ project });
    const row = revealButton("Read item · 1 problem");
    row.focus();
    fireEvent.click(row);
    const outline = () => within(screen.getByRole("list", { name: "Steps" }));
    expect(outline().getAllByText(/has no edge to it/)).toHaveLength(1);

    fireEvent.click(button("Remove 1.1.3 API · invoke"));

    expect(outline().queryByText(/has no edge to it/)).toBeNull();
    expect(revealButton("Read item")).toBeTruthy();
  });
});
