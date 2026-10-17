// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { inMemoryUseCases } from "../app/testing/in-memory-use-cases";
import type { UseCases } from "../app/use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { ProjectsScreen } from "./ProjectsScreen";

const CREATE_SAMPLE = "Create a project from Sample project";

function renderScreen(useCases: UseCases, onOpen = vi.fn()) {
  return render(
    <UseCasesProvider useCases={useCases}>
      <ProjectsScreen onOpen={onOpen} />
    </UseCasesProvider>,
  );
}

describe("ProjectsScreen", () => {
  afterEach(cleanup);

  it("says there are no projects yet and offers the templates", async () => {
    renderScreen(inMemoryUseCases([sampleRecord]).useCases);

    expect(await screen.findByText(/No projects yet/)).toBeTruthy();
    expect(await screen.findByLabelText(CREATE_SAMPLE)).toBeTruthy();
  });

  it("lists a project created from a template", async () => {
    renderScreen(inMemoryUseCases([sampleRecord]).useCases);

    fireEvent.click(await screen.findByLabelText(CREATE_SAMPLE));

    const listed = await screen.findByRole("button", {
      name: "Sample project",
    });
    expect(listed).toBeTruthy();
    expect(screen.queryByText(/No projects yet/)).toBeNull();
  });

  it("still lists a created project when the screen mounts again, as after a reload", async () => {
    const { useCases, projects } = inMemoryUseCases([sampleRecord]);
    const first = renderScreen(useCases);
    fireEvent.click(await screen.findByLabelText(CREATE_SAMPLE));
    await screen.findByRole("button", { name: "Sample project" });
    first.unmount();

    renderScreen(useCases);

    expect(
      await screen.findByRole("button", { name: "Sample project" }),
    ).toBeTruthy();
    expect(await projects.list()).toHaveLength(1);
  });

  it("opens a project when its name is clicked", async () => {
    const { useCases, projects } = inMemoryUseCases([]);
    await projects.save(sampleRecord);
    const onOpen = vi.fn();
    renderScreen(useCases, onOpen);

    fireEvent.click(
      await screen.findByRole("button", { name: "Sample project" }),
    );

    expect(onOpen).toHaveBeenCalledWith("sample");
  });

  it("says why when the projects can't be listed", async () => {
    const useCases = fakeUseCases({
      listProjects: { execute: () => Promise.reject(new Error("disk gone")) },
      listTemplates: { execute: () => Promise.resolve([]) },
    });
    renderScreen(useCases);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load your projects");
    expect(alert.textContent).toContain("disk gone");
  });

  it("says so when the chosen template has gone", async () => {
    const { useCases } = inMemoryUseCases([sampleRecord]);
    renderScreen({
      ...useCases,
      createProjectFromTemplate: {
        execute: () => Promise.resolve({ status: "template-missing" }),
      },
    });

    fireEvent.click(await screen.findByLabelText(CREATE_SAMPLE));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("That template no longer exists.");
  });
});
