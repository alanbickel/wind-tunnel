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

/** Clicks a button, as the keyboard would: the list's row, or a step. */
function selectFromText(name: string): HTMLElement {
  const button = screen.getByRole("button", { name });
  button.focus();
  fireEvent.click(button);
  return button;
}

function selectedTab(): string | null | undefined {
  return screen
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;
}

/** The outline's steps, as their buttons. */
function outlineSteps(): HTMLElement[] {
  const outline = screen.getByRole("list", { name: "Steps" });
  return within(outline).getAllByRole("button");
}

describe("OpenedProject's workflows", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if a workflow's row doesn't open its outline in Details, the
  // focus doesn't move to its heading, the row isn't marked while it's
  // selected, Details offers a Remove that does nothing, or Escape leaves
  // Details showing or drops the focus instead of returning it to the row.
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
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
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

  // Fails if the narrow layout doesn't show a workflow's outline in its
  // Details panel, or Close doesn't return the focus to the row.
  it("shows the outline in a narrow window's Details panel, until Close", () => {
    renderProject({ width: "narrow" });

    const row = selectFromText("Read item");
    const details = screen.getByRole("region", { name: "Details" });

    expect(document.activeElement).toBe(detailsHeading());
    expect(within(details).getByRole("list", { name: "Steps" })).toBeTruthy();
    fireEvent.click(within(details).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Details" })).toBeNull();
    expect(document.activeElement).toBe(row);
  });
});
