// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import type { Project } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  cantRunRegion,
  clickRun,
  detailsHeading,
  queryDetailsHeading,
  renderOpenedProject as renderProject,
  savedRecord,
  statusRegions,
} from "./testing/render-opened-project";

const [read] = sampleRecord.project.workflows;
const [steady] = sampleRecord.project.workloads;
if (read === undefined || steady === undefined) {
  throw new Error("The sample has a workflow and a workload");
}

/** Two workflows, and two workloads that mix them at different weights. */
const twoWorkloads: Project = {
  ...sampleRecord.project,
  workflows: [
    read,
    {
      id: "list",
      name: "List items",
      root: { id: "list-root", componentId: "table", action: "read" },
    },
  ],
  workloads: [
    {
      ...steady,
      mix: [
        { workflowId: "read", weight: 3 },
        { workflowId: "list", weight: 1 },
      ],
    },
    {
      ...steady,
      id: "spike",
      name: "Spike",
      mix: [
        { workflowId: "list", weight: 2 },
        { workflowId: "read", weight: 1 },
      ],
    },
  ],
};

function select(name: string): void {
  const button = screen.getByRole("button", { name });
  button.focus();
  fireEvent.click(button);
}

function addWorkflowButton(): HTMLElement {
  return screen.getByRole("button", { name: "Add workflow" });
}

/** The polite region beside "Add workflow". */
function removedRegion(): HTMLElement {
  const region =
    addWorkflowButton().parentElement?.querySelector('[role="status"]');
  if (!(region instanceof HTMLElement)) throw new Error("No removed region");
  return region;
}

function asking(question: string): HTMLElement {
  return screen.getByRole("group", { name: question });
}

function removeButton(): HTMLElement {
  return screen.getByRole("button", { name: "Remove" });
}

describe("OpenedProject's removing a workflow", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the confirmation doesn't name the workloads that run the
  // workflow, or says anything but the question when none does, or the
  // focus isn't on Cancel.
  it("asks first, naming the workloads that run it", () => {
    renderProject({ project: twoWorkloads });
    select("List items");

    fireEvent.click(removeButton());

    const group = asking("Remove List items?");
    expect(group.textContent).toContain(
      "Steady and Spike run it; it leaves their mixes.",
    );
    expect(document.activeElement).toBe(
      within(group).getByRole("button", { name: "Cancel" }),
    );
  });

  // Fails if a workflow no workload runs gets a warning anyway.
  it("says only the question when no workload runs it", () => {
    renderProject({ project: { ...twoWorkloads, workloads: [] } });
    select("List items");

    fireEvent.click(removeButton());

    expect(asking("Remove List items?").textContent).toBe(
      "Remove List items?RemoveCancel",
    );
  });

  // Fails if confirming doesn't save the workflow and its mix entries
  // gone, leaves the selection, doesn't move the focus to "Add workflow",
  // or announces from a region that wasn't on the page, empty, before.
  it("removes it on confirm, focuses Add workflow, and announces", async () => {
    const { projects } = renderProject({ project: twoWorkloads });
    const region = removedRegion();
    expect(region.textContent).toBe("");
    select("List items");
    fireEvent.click(removeButton());

    fireEvent.click(
      within(asking("Remove List items?")).getByRole("button", {
        name: "Remove",
      }),
    );

    const saved = await savedRecord(
      projects,
      (r) => r.project.workflows.length === 1,
    );
    expect(saved.project.workflows.map((w) => w.id)).toEqual(["read"]);
    expect(saved.project.workloads.map((w) => w.mix)).toEqual([
      [{ workflowId: "read", weight: 3 }],
      [{ workflowId: "read", weight: 1 }],
    ]);
    expect(queryDetailsHeading()).toBeNull();
    expect(document.activeElement).toBe(addWorkflowButton());
    expect(removedRegion()).toBe(region);
    expect(region.textContent).toBe("Removed List items.");
  });

  // Fails if Cancel or Escape removes anything, or the focus isn't
  // returned to Remove.
  it("keeps the workflow on Cancel or Escape", () => {
    renderProject({ project: twoWorkloads });
    select("List items");

    fireEvent.click(removeButton());
    fireEvent.click(
      within(asking("Remove List items?")).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(document.activeElement).toBe(removeButton());
    fireEvent.click(removeButton());
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(
      screen.queryByRole("group", { name: "Remove List items?" }),
    ).toBeNull();
    expect(detailsHeading().textContent).toBe("List items · Workflow");
    expect(removedRegion().textContent).toBe("");
    expect(screen.getByRole("button", { name: "List items" })).toBeTruthy();
  });

  // Fails if removing a workload's only workflow leaves it runnable, or
  // the project bar doesn't say why it can't run.
  it("leaves a workload with an empty mix unable to run, and says why", () => {
    renderProject();
    select("Read item");
    fireEvent.click(removeButton());

    fireEvent.click(
      within(asking("Remove Read item?")).getByRole("button", {
        name: "Remove",
      }),
    );

    expect(cantRunRegion().textContent).toBe(
      "Steady can't run yet: The mix has no workflows.",
    );
  });

  // Fails if Undo doesn't bring back the workflow at its place, and its
  // mix entries at their weights and places, in one step named for the remove.
  it("is undone in one step that restores the workflow and its mix entries", async () => {
    const { projects } = renderProject({ project: twoWorkloads });
    select("Read item");
    fireEvent.click(removeButton());
    fireEvent.click(
      within(asking("Remove Read item?")).getByRole("button", {
        name: "Remove",
      }),
    );
    await savedRecord(projects, (r) => r.project.workflows.length === 1);

    const undo = screen.getByRole("button", { name: /^Undo\b/ });
    expect(undo.textContent).toBe("Undo remove workflow Read item");
    fireEvent.click(undo);

    const saved = await savedRecord(
      projects,
      (r) => r.project.workflows.length === 2,
    );
    expect(saved.project.workflows.map((w) => w.id)).toEqual(["read", "list"]);
    expect(saved.project.workloads).toEqual(twoWorkloads.workloads);
  });

  // Fails if a remove leaves the run on screen current: the workflows are
  // part of the project ADR-0018 compares.
  it("marks the run out of date", async () => {
    const { runner } = renderProject({ project: twoWorkloads });
    clickRun();
    runner.send(sampleSnapshot({ second: 1 }));
    await runner.finish();
    expect(statusRegions()[1].textContent).toBe("");
    select("List items");
    fireEvent.click(removeButton());

    fireEvent.click(
      within(asking("Remove List items?")).getByRole("button", {
        name: "Remove",
      }),
    );

    expect(statusRegions()[1].textContent).toBe("Out of date");
  });
});
