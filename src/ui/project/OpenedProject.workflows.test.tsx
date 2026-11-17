// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  detailsHeading,
  dock,
  queryDetailsHeading,
  renderOpenedProject as renderProject,
} from "./testing/render-opened-project";

import { revealButton } from "./testing/canvas-panels";

/** Clicks a button, as the keyboard would: the list's row, or a step. */
function selectFromText(name: string): HTMLElement {
  const button = revealButton(name);
  button.focus();
  fireEvent.click(button);
  return button;
}

/** The dock's Workflows tab, which must be showing. */
function workflowsTab(): HTMLElement {
  return within(dock()).getByRole("tabpanel", { name: "Workflows" });
}

/** The outline's steps, as their buttons: the ones that start with a step's number. */
function outlineSteps(): HTMLElement[] {
  const outline = within(workflowsTab()).getByRole("list", { name: "Steps" });
  return within(outline)
    .getAllByRole("button")
    .filter((button) => /^[0-9]/.test(button.textContent));
}

/** Each step's line, and the issues that describe its button, if any. */
function stepsWithIssues(): (string | null)[][] {
  return outlineSteps().map((step) => {
    const id = step.getAttribute("aria-describedby");
    const issues =
      id === null ? [] : [document.getElementById(id)?.textContent ?? null];
    return [step.textContent, ...issues];
  });
}

/** Removes the selected component, confirming it. */
function removeSelected(): void {
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  const asking = screen.getByRole("group", { name: /^Remove / });
  fireEvent.click(within(asking).getByRole("button", { name: "Remove" }));
}

const REMOVED =
  "This step calls a component that isn't in the architecture any more.";

describe("OpenedProject's workflows", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if a workflow's row doesn't open its outline in the Workflows
  // tab, the focus doesn't move to the inspector's heading, the inspector
  // shows the outline or leaves out the workloads that run it, the row
  // isn't marked while its workflow is open, or Escape leaves Details
  // showing, closes the outline, or drops the focus instead of returning
  // it to the row.
  it("opens a workflow's outline in the dock from its row, and Escape returns to the row", () => {
    renderProject();

    const row = selectFromText("Read item");

    const details = screen.getByRole("region", { name: "Details" });
    expect(document.activeElement).toBe(detailsHeading());
    expect(detailsHeading().textContent).toBe("Read item · Workflow");
    expect(within(details).getByText("Used by: Steady (100.0%)")).toBeTruthy();
    expect(within(details).queryByRole("list", { name: "Steps" })).toBeNull();
    expect(row.getAttribute("aria-current")).toBe("true");
    expect(
      within(workflowsTab()).getByRole("region", { name: "Read item" }),
    ).toBeTruthy();
    expect(outlineSteps().map((step) => step.textContent)).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Table · read",
    ]);
    fireEvent.keyDown(detailsHeading(), { key: "Escape" });
    expect(screen.getByText(/^Nothing selected\./)).toBeTruthy();
    expect(document.activeElement).toBe(row);
    expect(queryDetailsHeading()).toBeNull();
    expect(outlineSteps()).toHaveLength(3);
  });

  // Fails if selecting a step in the outline moves the focus off its line,
  // doesn't mark it current, marks another too, shows its workflow in the
  // inspector instead of the step, or loses the workflow's outline; or if
  // Escape after it returns the focus anywhere but the step's line.
  it("selects a step from its line, leaving the focus there, and shows the step in the inspector", () => {
    renderProject();
    selectFromText("Read item");

    const step = selectFromText("1.1 Function · invoke");

    expect(document.activeElement).toBe(step);
    expect(
      outlineSteps().filter(
        (button) => button.getAttribute("aria-current") === "true",
      ),
    ).toEqual([step]);
    expect(detailsHeading().textContent).toBe(
      "Function · invoke · Step 1.1 of Read item",
    );
    expect(
      screen.getByText("Called by API · invoke, along API → Function."),
    ).toBeTruthy();
    fireEvent.keyDown(detailsHeading(), { key: "Escape" });
    expect(document.activeElement).toBe(step);
  });

  // Fails if the tab drops its open workflow once a box is selected, so
  // the outline goes while you click its boxes, or keeps a step marked
  // that isn't selected any more (rule 3).
  it("keeps the outline while a component is selected, with no step marked", () => {
    renderProject();
    selectFromText("Read item");
    selectFromText("1.1 Function · invoke");

    selectFromText("Table (DynamoDB)");
    fireEvent.click(screen.getByRole("tab", { name: "Workflows" }));

    expect(detailsHeading().textContent).toBe("Table · DynamoDB");
    expect(outlineSteps()).toHaveLength(3);
    expect(
      outlineSteps().filter((b) => b.getAttribute("aria-current") === "true"),
    ).toEqual([]);
    expect(
      within(workflowsTab())
        .getByRole("button", { name: "Read item" })
        .getAttribute("aria-current"),
    ).toBe("true");
  });

  // Fails if the tab shows an outline, or nothing, before a workflow has
  // been opened, rather than saying what a workflow is.
  it("says what a workflow is, beside the list, until one is opened", () => {
    renderProject();

    fireEvent.click(screen.getByRole("tab", { name: "Workflows" }));

    expect(
      within(workflowsTab()).getByText(/Select one to see its steps\.$/),
    ).toBeTruthy();
    expect(
      within(workflowsTab()).queryByRole("list", { name: "Steps" }),
    ).toBeNull();
  });

  // Fails if a project without workflows shows an empty list, or loses
  // the line on what a workflow is.
  it("says what a workflow is when there are none", () => {
    renderProject({ project: { ...sampleRecord.project, workflows: [] } });

    expect(screen.queryByRole("list", { name: "Workflows" })).toBeNull();
    expect(
      screen.getByText(
        "No workflows yet. A workflow is the path one kind of request takes through your architecture.",
      ),
    ).toBeTruthy();
  });

  // Fails if a workload-less workflow's Details say nothing of it, as an
  // empty "Used by:" would.
  it("says when no workload uses a workflow", () => {
    renderProject({ project: { ...sampleRecord.project, workloads: [] } });

    selectFromText("Read item");

    expect(screen.getByText("Used by: no workload yet")).toBeTruthy();
  });

  // Fails if removing a component doesn't put its issue on the step that
  // calls it, puts it on another step too, names the component by its ID,
  // or doesn't count it on the workflow's row.
  it("shows a removed component's issue on its step, and counts it on the row", () => {
    renderProject();
    expect(revealButton("Read item")).toBeTruthy();
    selectFromText("Table (DynamoDB)");

    removeSelected();
    selectFromText("Read item · 1 problem");

    expect(stepsWithIssues()).toEqual([
      ["1 API · invoke"],
      ["1.1 Function · invoke"],
      ["1.1.1 a removed component · read", REMOVED],
    ]);
    expect(screen.getByText(REMOVED)).toBeTruthy();
  });

  // Fails if a project that opens with a step on a missing component
  // can't show its outline, or doesn't show the step's issue (#94).
  it("shows the issue of a step a project opened with", () => {
    const [read] = sampleRecord.project.workflows;
    if (read === undefined) throw new Error("The sample has a workflow");
    const root = { id: "only", componentId: "gone", action: "invoke" as const };
    renderProject({
      project: { ...sampleRecord.project, workflows: [{ ...read, root }] },
    });

    selectFromText("Read item · 1 problem");

    expect(stepsWithIssues()).toEqual([
      ["1 a removed component · invoke", REMOVED],
    ]);
  });

  // Fails if the narrow layout shows a workflow's outline in its Details
  // panel rather than the dock's Workflows tab, or Close doesn't return the
  // focus to the row.
  it("shows the outline in a narrow window's dock, and Close returns to the row", () => {
    renderProject({ width: "narrow" });

    const row = selectFromText("Read item");
    const details = screen.getByRole("region", { name: "Details" });

    expect(document.activeElement).toBe(detailsHeading());
    expect(within(details).queryByRole("list", { name: "Steps" })).toBeNull();
    expect(outlineSteps()).toHaveLength(3);
    fireEvent.click(within(details).getByRole("button", { name: "Close" }));
    expect(queryDetailsHeading()).toBeNull();
    expect(document.activeElement).toBe(row);
  });
});
