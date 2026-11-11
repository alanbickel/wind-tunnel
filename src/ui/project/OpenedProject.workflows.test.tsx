// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  detailsHeading,
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

function selectedTab(): string | null | undefined {
  return screen
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;
}

/** The outline's steps, as their buttons: the ones that start with a step's number. */
function outlineSteps(): HTMLElement[] {
  const outline = screen.getByRole("list", { name: "Steps" });
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

  // Fails if a workflow's row doesn't open its outline in Details, the
  // focus doesn't move to its heading, the row isn't marked while it's
  // selected, or Escape leaves Details showing or drops the focus instead
  // of returning it to the row.
  it("opens a workflow's outline from its row, and Escape returns to the row", () => {
    renderProject();

    const row = selectFromText("Read item");

    expect(selectedTab()).toBe("Details");
    expect(document.activeElement).toBe(detailsHeading());
    expect(detailsHeading().textContent).toBe("Read item · Workflow");
    expect(row.getAttribute("aria-current")).toBe("true");
    expect(outlineSteps().map((step) => step.textContent)).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Table · read",
    ]);
    expect(screen.getByText("Used by: Steady")).toBeTruthy();
    fireEvent.keyDown(detailsHeading(), { key: "Escape" });
    expect(selectedTab()).toBe("Run");
    expect(document.activeElement).toBe(row);
    expect(queryDetailsHeading()).toBeNull();
    expect(row.getAttribute("aria-current")).toBeNull();
  });

  // Fails if selecting a step doesn't mark it current, marks another too,
  // or loses the workflow's outline; or if Escape after it returns the
  // focus to the step's button, which went with Details, not to the row.
  it("marks a step selected in the outline, and Escape still returns to the row", () => {
    renderProject();
    const row = selectFromText("Read item");

    const step = selectFromText("1.1 Function · invoke");

    expect(step.getAttribute("aria-current")).toBe("true");
    expect(
      outlineSteps().filter(
        (button) => button.getAttribute("aria-current") === "true",
      ),
    ).toEqual([step]);
    expect(document.activeElement).toBe(detailsHeading());
    expect(row.getAttribute("aria-current")).toBe("true");
    fireEvent.keyDown(detailsHeading(), { key: "Escape" });
    expect(document.activeElement).toBe(row);
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
    selectFromText("Table (dynamodb)");

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

  // Fails if the narrow layout doesn't show a workflow's outline in its
  // Details panel, or Close doesn't return the focus to the row.
  it("shows the outline in a narrow window's Details panel, until Close", () => {
    renderProject({ width: "narrow" });

    const row = selectFromText("Read item");
    const details = screen.getByRole("region", { name: "Details" });

    expect(document.activeElement).toBe(detailsHeading());
    expect(within(details).getByRole("list", { name: "Steps" })).toBeTruthy();
    fireEvent.click(within(details).getByRole("button", { name: "Close" }));
    expect(queryDetailsHeading()).toBeNull();
    expect(document.activeElement).toBe(row);
  });
});
