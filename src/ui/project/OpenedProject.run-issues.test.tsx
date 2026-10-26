// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectWithRunIssue } from "../../application/testing/project-with-run-issue";
import { sampleRecord } from "../../application/testing/sample-record";
import type { Project } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  cantRunRegion,
  clickRun,
  renderOpenedProject as renderProject,
} from "./testing/render-opened-project";

const WRITE_RUSH_REASON =
  "Write rush can't run yet: Write item calls orders-db, which isn't in the architecture.";

/** The sample project with its one workflow reading a table that isn't there. */
function withReadOfMissingTable(): Project {
  const [read] = sampleRecord.project.workflows;
  if (read === undefined) throw new Error("The sample has a workflow");
  const root = {
    componentId: "api",
    action: "invoke" as const,
    calls: [{ componentId: "orders-db", action: "read" as const }],
  };
  return { ...sampleRecord.project, workflows: [{ ...read, root }] };
}

function picker(): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>("combobox", { name: "Workload" });
}

function runButton(): HTMLElement {
  return screen.getByRole("button", { name: "Run" });
}

describe("OpenedProject's workloads that can't run", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if RunControls stops marking a workload whose checks fail.
  it("marks a workload that can't run in the picker", () => {
    renderProject({ project: projectWithRunIssue });

    const options = [...picker().options].map((option) => option.text);

    expect(options).toEqual(["Steady", "Write rush (can't run yet)"]);
  });

  // Fails if Run stays usable for a workload that can't run, or the bar
  // doesn't say why.
  it("makes Run wait, and says why, while that workload is picked", () => {
    const { runner } = renderProject({ project: projectWithRunIssue });
    expect(runButton().getAttribute("aria-disabled")).toBe("false");
    expect(cantRunRegion().textContent).toBe("");

    fireEvent.change(picker(), { target: { value: "write-rush" } });
    clickRun();

    expect(runButton().getAttribute("aria-disabled")).toBe("true");
    expect(cantRunRegion().textContent).toBe(WRITE_RUSH_REASON);
    expect(runner.runs).toBe(0);
  });

  // Fails if the reason's live region is mounted only once there's a
  // reason, which many screen readers wouldn't announce (UX §4.4), or the
  // reason doesn't follow a change to the project.
  it("announces it when a change stops the picked workload running", () => {
    const { change } = renderProject();
    const region = cantRunRegion();
    expect(region.textContent).toBe("");

    change(withReadOfMissingTable());

    expect(cantRunRegion()).toBe(region);
    expect(region.textContent).toBe(
      "Steady can't run yet: Read item calls orders-db, which isn't in the architecture.",
    );
    expect(runButton().getAttribute("aria-disabled")).toBe("true");
  });
});
