// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLookup } from "../../application/ports/project-repository";
import { sampleRecord } from "../../application/testing/sample-record";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { ProjectScreen } from "./ProjectScreen";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { stubWindowWidth } from "../shared/testing/stub-window-width";

function renderLookup(lookup: ProjectLookup) {
  const useCases = fakeUseCases({
    openProject: { execute: () => Promise.resolve(lookup) },
  });
  return render(
    <UseCasesProvider useCases={useCases}>
      <ProjectScreen id="p1" />
    </UseCasesProvider>,
  );
}

describe("ProjectScreen", () => {
  beforeEach(() => {
    stubDiagramBrowserApis();
    stubWindowWidth("wide");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows an opened project's name and its architecture", async () => {
    renderLookup({ status: "found", record: sampleRecord });

    expect(
      await screen.findByRole("heading", { name: "Sample project" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Architecture" })).toBeTruthy();
  });

  it("shows why an invalid project can't be opened, issue by issue", async () => {
    renderLookup({
      status: "invalid",
      reason: "Saved in a form this version can't open.",
      issues: [
        { path: ["workflows", 0, "root"], message: "Unknown component" },
        { path: [], message: "Not a project" },
      ],
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Saved in a form this version can't open.",
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "This project can't be opened" }),
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "workflows.0.root: Unknown component",
      "Not a project",
    ]);
  });

  it("says so when the project no longer exists", async () => {
    renderLookup({ status: "missing" });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("This project no longer exists.");
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Project not found" }),
    );
  });
});
