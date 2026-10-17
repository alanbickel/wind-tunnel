// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLookup } from "../../application/ports/project-repository";
import { sampleRecord } from "../../application/testing/sample-record";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { ProjectScreen } from "./ProjectScreen";

function renderLookup(lookup: ProjectLookup, onClose = vi.fn()) {
  const useCases = fakeUseCases({
    openProject: { execute: () => Promise.resolve(lookup) },
  });
  return render(
    <UseCasesProvider useCases={useCases}>
      <ProjectScreen id="p1" onClose={onClose} />
    </UseCasesProvider>,
  );
}

describe("ProjectScreen", () => {
  afterEach(cleanup);

  it("shows an opened project's name and what it's made of", async () => {
    renderLookup({ status: "found", record: sampleRecord });

    expect(
      await screen.findByRole("heading", { name: "Sample project" }),
    ).toBeTruthy();
    expect(screen.getByText("Components: 3 · Workflows: 1")).toBeTruthy();
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

  it("goes back to the list", async () => {
    const onClose = vi.fn();
    renderLookup({ status: "missing" }, onClose);
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "← All projects" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
