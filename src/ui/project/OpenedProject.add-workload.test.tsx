// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import type { Project } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { revealButton } from "./testing/canvas-panels";
import {
  cantRunRegion,
  detailsHeading,
  renderOpenedProject as renderProject,
  savedRecord,
  undoneRegion,
} from "./testing/render-opened-project";

/** A blank project: no components, no workflows, no workloads. */
const blank: Project = {
  ...sampleRecord.project,
  architecture: { components: [], edges: [] },
  workflows: [],
  workloads: [],
};

function addWorkload(): HTMLElement {
  const button = revealButton("Add workload");
  button.focus();
  fireEvent.click(button);
  return button;
}

function nameField(): HTMLInputElement {
  const details = screen.getByRole("tabpanel", { name: "Details" });
  return within(details).getByRole("textbox", { name: "Name" });
}

function picker(): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>("combobox", { name: "Workload" });
}

function undoButton(): HTMLElement {
  return screen.getByRole("button", { name: /^Undo\b/ });
}

describe("OpenedProject's adding a workload", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if Add workload doesn't save a workload with the editor's
  // defaults and an id from the generator, or the undo step isn't named
  // "Add workload workload-1".
  it("saves a workload with the editor's defaults, as one undo step", async () => {
    const { projects } = renderProject();

    addWorkload();

    const saved = await savedRecord(
      projects,
      (r) => r.project.workloads.length === 2,
    );
    expect(saved.project.workloads[1]).toEqual({
      id: "wl-1",
      name: "workload-1",
      durationMs: 60_000,
      seed: 42,
      mix: [],
      profile: [{ atMs: 0, requestsPerSec: 100 }],
    });
    expect(undoButton().textContent).toBe("Undo add workload workload-1");
  });

  // Fails if the new workload isn't selected, with its name field taking the
  // focus and its text selected, ready to type over.
  it("selects it, with the focus in its name field, selected", () => {
    renderProject();

    addWorkload();

    expect(detailsHeading().textContent).toBe("workload-1 · Workload");
    const input = nameField();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("workload-1");
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 10]);
  });

  // Fails if the bar still shows the workload it showed before, so Run
  // would run something other than what the user is editing, or the bar
  // doesn't say why the new workload can't run.
  it("picks it in the bar, which says why it can't run yet", () => {
    renderProject();

    addWorkload();

    expect(picker().selectedOptions[0]?.textContent).toBe(
      "workload-1 (can't run yet)",
    );
    expect(cantRunRegion().textContent).toBe(
      "workload-1 can't run yet: The mix has no workflows.",
    );
  });

  // Fails if the new workload's empty-mix issue isn't on its row, in
  // Details, and in the bar: a new workload starts with it.
  it("shows the empty-mix issue on the row and in Details", () => {
    renderProject();

    addWorkload();

    expect(
      screen.getByRole("button", { name: "workload-1 · 1 problem" }),
    ).toBeTruthy();
    const details = screen.getByRole("tabpanel", { name: "Details" });
    expect(
      within(details).getByText(
        "No workflows in the mix. A workload with an empty mix can't run.",
      ),
    ).toBeTruthy();
  });

  // Fails if a blank project, with no workflows to mix, can't add a
  // workload, or the workload shows no issue.
  it("adds to a blank project", async () => {
    const { projects } = renderProject({ project: blank });
    expect(screen.queryByRole("combobox", { name: "Workload" })).toBeNull();

    addWorkload();

    await savedRecord(projects, (r) => r.project.workloads.length === 1);
    expect(picker().selectedOptions[0]?.textContent).toBe(
      "workload-1 (can't run yet)",
    );
    expect(cantRunRegion().textContent).toBe(
      "workload-1 can't run yet: The mix has no workflows.",
    );
  });

  // Fails if two adds both get "workload-1", or the name isn't the first free.
  it("names a second one workload-2", () => {
    renderProject({ project: blank });

    addWorkload();
    addWorkload();

    expect(detailsHeading().textContent).toBe("workload-2 · Workload");
    expect(
      within(screen.getByRole("list", { name: "Workloads" }))
        .getAllByRole("button")
        .map((row) => row.textContent),
    ).toEqual(["workload-1 · 1 problem", "workload-2 · 1 problem"]);
  });

  // Fails if Undo of an add leaves the workload, or its selection, or
  // the bar picking it; or a Redo doesn't bring it back, selected.
  it("is undone and redone as one step each, with the selection following", async () => {
    const { projects } = renderProject();
    addWorkload();
    await savedRecord(projects, (r) => r.project.workloads.length === 2);

    fireEvent.click(undoButton());

    await savedRecord(projects, (r) => r.project.workloads.length === 1);
    expect(undoneRegion().textContent).toBe("Undid: add workload workload-1.");
    expect(screen.queryByRole("button", { name: /^workload-1/ })).toBeNull();
    expect(picker().selectedOptions[0]?.textContent).toBe("Steady");
    fireEvent.click(screen.getByRole("button", { name: /^Redo\b/ }));
    await savedRecord(projects, (r) => r.project.workloads.length === 2);
    expect(detailsHeading().textContent).toBe("workload-1 · Workload");
  });

  // Fails if adding a workload marks the run on screen out of date: it
  // changes no workload a run used (ADR-0018).
  it("keeps the run current", async () => {
    const { runner } = renderProject();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await runner.finish();

    addWorkload();

    const [, outOfDate] = within(screen.getByRole("banner"))
      .getAllByRole("status")
      .slice(1, 3);
    expect(outOfDate?.textContent).toBe("");
  });
});
