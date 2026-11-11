// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { inMemoryUseCases } from "../app/testing/in-memory-use-cases";
import type { UseCases } from "../app/use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { ProjectsScreen } from "./ProjectsScreen";

const CREATE_SAMPLE = "Create a project from Sample project";
const CREATE_STATUS = "Project creation";

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

  // Fails if ProjectList passes onOpen another project, or only its id: the
  // breadcrumb needs the name.
  it("opens the project whose name is clicked", async () => {
    const { useCases, projects } = inMemoryUseCases([]);
    await projects.save(sampleRecord);
    await projects.save({
      ...sampleRecord,
      project: { ...sampleRecord.project, id: "other", name: "Other project" },
    });
    const onOpen = vi.fn();
    renderScreen(useCases, onOpen);

    fireEvent.click(
      await screen.findByRole("button", { name: "Other project" }),
    );

    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ id: "other", name: "Other project" }),
    );
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

  it("says why when creating a project fails", async () => {
    const { useCases } = inMemoryUseCases([sampleRecord]);
    renderScreen({
      ...useCases,
      createProjectFromTemplate: {
        execute: () => Promise.reject(new Error("quota exceeded")),
      },
    });

    fireEvent.click(await screen.findByLabelText(CREATE_SAMPLE));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Couldn't create the project: Error: quota exceeded",
    );
  });

  it("clears the last problem when the next create succeeds", async () => {
    const { useCases } = inMemoryUseCases([sampleRecord]);
    const real = useCases.createProjectFromTemplate;
    let calls = 0;
    renderScreen({
      ...useCases,
      createProjectFromTemplate: {
        execute: (templateId) =>
          calls++ === 0
            ? Promise.resolve({ status: "template-missing" })
            : real.execute(templateId),
      },
    });
    fireEvent.click(await screen.findByLabelText(CREATE_SAMPLE));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByLabelText(CREATE_SAMPLE));

    await screen.findByRole("button", { name: "Sample project" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("creates one project when Create is clicked twice in a row", async () => {
    const { useCases, projects } = inMemoryUseCases([sampleRecord]);
    renderScreen(useCases);
    const create = await screen.findByLabelText(CREATE_SAMPLE);

    fireEvent.click(create);
    fireEvent.click(create);

    const templates = screen.getByRole("region", {
      name: "Create from template",
    });
    expect(
      within(templates).getByRole("status", { name: CREATE_STATUS })
        .textContent,
    ).toBe("Creating the project…");
    expect(create.getAttribute("aria-disabled")).toBe("true");
    await screen.findByRole("button", { name: "Sample project" });
    expect(await projects.list()).toHaveLength(1);
  });

  // Fails if the template create's status region mounts with its message
  // instead of being there, empty, before the create starts.
  it("announces the template create in a status region that was already there", async () => {
    const { useCases } = inMemoryUseCases([sampleRecord]);
    renderScreen({
      ...useCases,
      createProjectFromTemplate: {
        execute: () => new Promise(() => undefined),
      },
    });
    const create = await screen.findByLabelText(CREATE_SAMPLE);
    const templates = screen.getByRole("region", {
      name: "Create from template",
    });
    const status = within(templates).getByRole("status", {
      name: CREATE_STATUS,
    });
    expect(status.textContent).toBe("");

    fireEvent.click(create);

    await waitFor(() => {
      expect(status.textContent).toBe("Creating the project…");
    });
    expect(within(templates).getByRole("status", { name: CREATE_STATUS })).toBe(
      status,
    );
  });
});

describe("ProjectsScreen's Create blank", () => {
  afterEach(cleanup);

  function nameField(): HTMLInputElement {
    return screen.getByRole<HTMLInputElement>("textbox", {
      name: "Project name",
    });
  }

  /** Types the name, and presses "Create blank". */
  async function createBlank(name: string) {
    const field = await screen.findByRole("textbox", { name: "Project name" });
    fireEvent.change(field, { target: { value: name } });
    fireEvent.click(screen.getByRole("button", { name: "Create blank" }));
  }

  /** The field's message, once it shows, checked to be tied to the field. */
  async function fieldMessage(): Promise<string | null> {
    const message = await screen.findByRole("alert");
    expect(nameField().getAttribute("aria-invalid")).toBe("true");
    expect(nameField().getAttribute("aria-describedby")).toBe(message.id);
    return message.textContent;
  }

  // Fails if an empty name reaches the use case, or its message isn't
  // tied to the field, so a screen reader doesn't read it with the field.
  it("refuses an empty name on the field, and creates nothing", async () => {
    const { useCases, projects } = inMemoryUseCases([sampleRecord]);
    const onOpen = vi.fn();
    renderScreen(useCases, onOpen);

    await createBlank("   ");

    expect(await fieldMessage()).toBe("A project needs a name.");
    expect(await projects.list()).toEqual([]);
    expect(onOpen).not.toHaveBeenCalled();
  });

  // Fails if the name isn't checked against the saved projects, or by
  // case, before creating.
  it("refuses a name another project uses, and creates nothing", async () => {
    const { useCases, projects } = inMemoryUseCases([]);
    await projects.save(sampleRecord);
    const onOpen = vi.fn();
    renderScreen(useCases, onOpen);

    await createBlank("sample project");

    expect(await fieldMessage()).toBe(
      "Another project already uses this name. Please choose another name.",
    );
    expect(await projects.list()).toHaveLength(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  // Fails if the use case's backstop result is dropped, so a name taken
  // since the check shows nothing.
  it("shows the clash message when the use case refuses the name", async () => {
    const { useCases } = inMemoryUseCases([]);
    renderScreen({
      ...useCases,
      createBlankProject: {
        execute: () => Promise.resolve({ status: "name-taken" }),
      },
    });

    await createBlank("Orders service");

    expect(await fieldMessage()).toBe(
      "Another project already uses this name. Please choose another name.",
    );
  });

  // Fails if Enter in the field doesn't create, or the name isn't trimmed,
  // or the new project isn't handed to onOpen.
  it("creates on Enter, and opens the project", async () => {
    const { useCases, projects } = inMemoryUseCases([]);
    const onOpen = vi.fn();
    renderScreen(useCases, onOpen);
    const field = await screen.findByRole("textbox", { name: "Project name" });

    fireEvent.change(field, { target: { value: " Orders service " } });
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() => {
      expect(onOpen).toHaveBeenCalledWith(
        expect.objectContaining({ id: "project-1", name: "Orders service" }),
      );
    });
    expect(await projects.list()).toHaveLength(1);
  });

  // Fails if the status region mounts with its message, which many screen
  // readers don't announce, instead of being there, empty, from the start.
  it("announces the create in a status region that was already there", async () => {
    const { useCases } = inMemoryUseCases([]);
    renderScreen({
      ...useCases,
      createBlankProject: { execute: () => new Promise(() => undefined) },
    });
    const blank = await screen.findByRole("region", { name: "Create blank" });
    const status = within(blank).getByRole("status");
    expect(status.textContent).toBe("");

    await createBlank("Orders service");

    await waitFor(() => {
      expect(status.textContent).toBe("Creating the project…");
    });
    expect(within(blank).getByRole("status")).toBe(status);
  });

  // Fails if typing leaves a stale message, and aria-invalid, on the field.
  it("clears the message when the name changes", async () => {
    renderScreen(inMemoryUseCases([]).useCases);
    await createBlank("");
    await screen.findByRole("alert");

    fireEvent.change(nameField(), { target: { value: "O" } });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(nameField().getAttribute("aria-invalid")).toBe("false");
  });
});
