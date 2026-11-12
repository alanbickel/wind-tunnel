// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import type { Project, Workload } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { revealButton } from "./testing/canvas-panels";
import {
  clickRun,
  detailsHeading,
  queryDetailsHeading,
  renderOpenedProject as renderProject,
  savedRecord,
  statusRegions,
} from "./testing/render-opened-project";

const [steady] = sampleRecord.project.workloads;
if (steady === undefined) throw new Error("The sample has a workload");

/** Three workloads, each with its own profile, so a restore can be checked. */
const first: Workload = steady;
const middle: Workload = {
  ...steady,
  id: "lunch",
  name: "Lunch rush",
  seed: 7,
  profile: [
    { atMs: 0, requestsPerSec: 5 },
    { atMs: 2_000, requestsPerSec: 50 },
  ],
};
const last: Workload = { ...steady, id: "dinner", name: "Dinner", seed: 9 };

const threeWorkloads: Project = {
  ...sampleRecord.project,
  workloads: [first, middle, last],
};

/** Selects a workload from the Workflows panel's list. */
function select(name: string): void {
  const button = revealButton(name);
  button.focus();
  fireEvent.click(button);
}

function removeButton(): HTMLElement {
  return screen.getByRole("button", { name: "Remove" });
}

function asking(question: string): HTMLElement {
  return screen.getByRole("group", { name: question });
}

/** Opens Details' Remove for the workload and confirms it. */
function removeWorkload(name: string): void {
  select(name);
  fireEvent.click(removeButton());
  fireEvent.click(
    within(asking(`Remove ${name}?`)).getByRole("button", { name: "Remove" }),
  );
}

function picker(): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>("combobox", { name: "Workload" });
}

function pickedName(): string | undefined {
  return picker().selectedOptions[0]?.textContent ?? undefined;
}

/**
 * The polite region that says what a workload's remove took: beside the
 * canvas's panel buttons, which always show.
 */
function removedRegion(): HTMLElement {
  const region = screen
    .getByRole("button", { name: "Workflows" })
    .parentElement?.querySelector('[role="status"]');
  if (!(region instanceof HTMLElement)) throw new Error("No removed region");
  return region;
}

function addWorkloadButton(): HTMLElement {
  return revealButton("Add workload");
}

describe("OpenedProject's removing a workload", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if Remove removes at once, the question doesn't name the
  // workload, carries a warning, or the focus isn't on Cancel.
  it("asks first, naming the workload, with the focus on Cancel", () => {
    renderProject({ project: threeWorkloads });
    select("Lunch rush");

    fireEvent.click(removeButton());

    const group = asking("Remove Lunch rush?");
    expect(group.textContent).toBe("Remove Lunch rush?RemoveCancel");
    expect(document.activeElement).toBe(
      within(group).getByRole("button", { name: "Cancel" }),
    );
  });

  // Fails if Cancel or Escape removes anything, or the focus isn't
  // returned to Remove.
  it("keeps the workload on Cancel or Escape", () => {
    renderProject({ project: threeWorkloads });
    select("Lunch rush");

    fireEvent.click(removeButton());
    fireEvent.click(
      within(asking("Remove Lunch rush?")).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(document.activeElement).toBe(removeButton());
    fireEvent.click(removeButton());
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(
      screen.queryByRole("group", { name: "Remove Lunch rush?" }),
    ).toBeNull();
    expect(detailsHeading().textContent).toBe("Lunch rush · Workload");
    expect(removedRegion().textContent).toBe("");
    expect(revealButton("Lunch rush")).toBeTruthy();
  });

  // Fails if confirming doesn't save the workload gone and the workflows
  // as they were, leaves the selection, doesn't move the focus to "Add
  // workload", or announces from a region that wasn't on the page, empty,
  // before.
  it("removes it on confirm, focuses Add workload, and announces", async () => {
    const { projects } = renderProject({ project: threeWorkloads });
    const region = removedRegion();
    expect(region.textContent).toBe("");

    removeWorkload("Lunch rush");

    const saved = await savedRecord(
      projects,
      (r) => r.project.workloads.length === 2,
    );
    expect(saved.project.workloads.map((w) => w.id)).toEqual([
      "steady",
      "dinner",
    ]);
    expect(saved.project.workflows).toEqual(sampleRecord.project.workflows);
    expect(queryDetailsHeading()).toBeNull();
    expect(document.activeElement).toBe(addWorkloadButton());
    expect(removedRegion()).toBe(region);
    expect(region.textContent).toBe("Removed Lunch rush.");
  });

  // Fails if the bar keeps the removed workload, or picks the first
  // instead of the one after it.
  it("picks the workload after it in the bar", () => {
    renderProject({ project: threeWorkloads });

    removeWorkload("Lunch rush");

    expect(pickedName()).toBe("Dinner");
  });

  // Fails if removing a workload other than the picked one moves the bar's
  // pick, here to the one after the removed.
  it("leaves the bar's pick alone when another workload is removed", () => {
    renderProject({ project: threeWorkloads });
    select("Lunch rush");
    fireEvent.change(picker(), { target: { value: "steady" } });
    expect(pickedName()).toBe("Steady");

    fireEvent.click(removeButton());
    fireEvent.click(
      within(asking("Remove Lunch rush?")).getByRole("button", {
        name: "Remove",
      }),
    );

    expect(pickedName()).toBe("Steady");
  });

  // Fails if removing the last workload picks nothing, or the first
  // instead of the one before it.
  it("picks the one before when it was last", () => {
    renderProject({ project: threeWorkloads });

    removeWorkload("Dinner");

    expect(pickedName()).toBe("Lunch rush");
  });

  // Fails if removing the only workload leaves a picker, or the bar
  // doesn't say what it says today for a project with none.
  it("picks none when none is left, and the bar says so", () => {
    renderProject();

    removeWorkload("Steady");

    expect(screen.queryByRole("combobox", { name: "Workload" })).toBeNull();
    expect(
      screen.getByText("This project has no workloads to run."),
    ).toBeTruthy();
  });

  // Fails if Undo doesn't bring the workload back at its place, with its
  // mix and profile, selected, in one step named for the remove; or a
  // second undo isn't named for what it undoes.
  it("is undone in one step that restores it whole, at its place, selected", async () => {
    const { projects } = renderProject({ project: threeWorkloads });
    removeWorkload("Lunch rush");
    await savedRecord(projects, (r) => r.project.workloads.length === 2);

    const undo = screen.getByRole("button", { name: /^Undo\b/ });
    expect(undo.textContent).toBe("Undo remove workload Lunch rush");
    fireEvent.click(undo);

    const saved = await savedRecord(
      projects,
      (r) => r.project.workloads.length === 3,
    );
    expect(saved.project.workloads).toEqual([first, middle, last]);
    expect(detailsHeading().textContent).toBe("Lunch rush · Workload");
    expect(pickedName()).toBe("Lunch rush");
  });

  // Fails if undoing the remove steals the selection from a workflow
  // selected since (UX §4.1's exception).
  it("keeps a workflow selected since through the undo", () => {
    renderProject({ project: threeWorkloads });
    removeWorkload("Lunch rush");
    select("Read item");

    fireEvent.click(screen.getByRole("button", { name: /^Undo\b/ }));

    expect(detailsHeading().textContent).toBe("Read item · Workflow");
  });

  // Fails if the run of the removed workload isn't marked out of date, or
  // disappears from the screen.
  it("marks the run of the removed workload out of date, and keeps it", async () => {
    const { runner } = renderProject({ project: threeWorkloads });
    clickRun();
    runner.send(sampleSnapshot({ second: 1 }));
    await runner.finish();
    expect(statusRegions()[1].textContent).toBe("");

    removeWorkload("Steady");

    expect(statusRegions()[1].textContent).toBe("Out of date");
    expect(statusRegions()[0].textContent).not.toBe("");
  });

  // Fails if removing a workload the run didn't use marks the run out of
  // date.
  it("keeps the run of another workload current", async () => {
    const { runner } = renderProject({ project: threeWorkloads });
    clickRun();
    runner.send(sampleSnapshot({ second: 1 }));
    await runner.finish();

    removeWorkload("Dinner");

    expect(statusRegions()[1].textContent).toBe("");
  });
});
