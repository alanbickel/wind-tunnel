// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PersistenceStatus,
  StoragePersistence,
} from "../application/ports/storage-persistence";
import { awsNewComponent } from "../application/testing/aws-component-types";
import { awsSaveProject } from "../application/testing/aws-save-project";
import { sampleRecord } from "../application/testing/sample-record";
import { App } from "./App";
import { inMemoryUseCases } from "./app/testing/in-memory-use-cases";
import { UseCasesProvider } from "./app/UseCasesProvider";
import { StartupFailure } from "./StartupFailure";
import { stubDiagramBrowserApis } from "./diagram/testing/stub-diagram-browser-apis";
import { stubWindowWidth } from "./shared/testing/stub-window-width";

describe("App", () => {
  beforeEach(() => {
    stubDiagramBrowserApis();
    stubWindowWidth("wide");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function renderAppWithSample() {
    const { useCases, projects } = inMemoryUseCases([]);
    await projects.save(sampleRecord);
    render(
      <UseCasesProvider useCases={useCases}>
        <App />
      </UseCasesProvider>,
    );
  }

  it("leaves focus alone when the list first loads", async () => {
    await renderAppWithSample();

    await screen.findByRole("button", { name: "Sample project" });

    expect(document.activeElement).toBe(document.body);
  });

  it("opens a project with focus on its heading", async () => {
    await renderAppWithSample();

    fireEvent.click(
      await screen.findByRole("button", { name: "Sample project" }),
    );

    const heading = await screen.findByRole("heading", {
      name: "Sample project",
    });
    expect(document.activeElement).toBe(heading);
  });

  it("goes back to the list with focus on the project that was open", async () => {
    await renderAppWithSample();
    fireEvent.click(
      await screen.findByRole("button", { name: "Sample project" }),
    );
    await screen.findByRole("heading", { name: "Sample project" });

    fireEvent.click(screen.getByRole("button", { name: "Projects" }));

    const button = await screen.findByRole("button", {
      name: "Sample project",
    });
    expect(document.activeElement).toBe(button);
  });

  // Fails if App stops passing the open project's name to the top bar: the
  // breadcrumb stays at "Projects" on the project screen.
  it("names the open project in the breadcrumb", async () => {
    await renderAppWithSample();
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb.textContent).toBe("Projects");

    fireEvent.click(
      await screen.findByRole("button", { name: "Sample project" }),
    );
    await screen.findByRole("heading", { name: "Sample project" });

    expect(breadcrumb.textContent).toBe("Projects›Sample project");
  });

  // Fails if the breadcrumb doesn't update to the new name on rename or doesn't restore on undo.
  it("updates the breadcrumb on rename and puts back the old name on undo", async () => {
    const { useCases, projects } = inMemoryUseCases([]);
    await projects.save(sampleRecord);
    render(
      <UseCasesProvider
        useCases={{
          ...useCases,
          saveProject: awsSaveProject(projects),
        }}
      >
        <App />
      </UseCasesProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Sample project" }),
    );
    await screen.findByRole("heading", { name: "Sample project" });

    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb.textContent).toBe("Projects›Sample project");

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Project name" });
    fireEvent.change(input, { target: { value: "Orders API" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await screen.findByRole("heading", { name: "Orders API" });
    await waitFor(() => {
      expect(breadcrumb.textContent).toBe("Projects›Orders API");
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Undo rename Sample project to Orders API",
      }),
    );
    await screen.findByRole("heading", { name: "Sample project" });
    await waitFor(() => {
      expect(breadcrumb.textContent).toBe("Projects›Sample project");
    });
  });

  // Fails if going back to the projects list doesn't list the renamed project first under its new name.
  it("lists the renamed project first on going back to the projects screen", async () => {
    const { useCases, projects } = inMemoryUseCases([]);
    await projects.save(sampleRecord);
    await projects.save({
      ...sampleRecord,
      project: { ...sampleRecord.project, id: "other", name: "Other project" },
      updatedAt: "2026-10-17T12:05:00.000Z",
    });
    render(
      <UseCasesProvider
        useCases={{
          ...useCases,
          saveProject: awsSaveProject(projects),
        }}
      >
        <App />
      </UseCasesProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Sample project" }),
    );
    await screen.findByRole("heading", { name: "Sample project" });

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Project name" });
    fireEvent.change(input, { target: { value: "Orders API" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByRole("heading", { name: "Orders API" });

    fireEvent.click(screen.getByRole("button", { name: "Projects" }));

    await screen.findByRole("button", { name: "Orders API" });
    const listed = within(
      screen.getByRole("region", { name: "Your projects" }),
    ).getAllByRole("button");
    expect(listed.map((button) => button.textContent)).toEqual([
      "Orders API",
      "Other project",
    ]);
  });
});

describe("App's blank project", () => {
  beforeEach(() => {
    stubDiagramBrowserApis();
    stubWindowWidth("wide");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const PROMPT = "No components yet. Add one to start describing your system.";

  /** The app over memory, with the sample saved, adding and saving components. */
  async function renderApp() {
    const { useCases, projects } = inMemoryUseCases([]);
    await projects.save(sampleRecord);
    const storagePersistence = {
      request: vi.fn(() => Promise.resolve("persisted" as const)),
    };
    render(
      <UseCasesProvider
        useCases={{
          ...useCases,
          newComponent: awsNewComponent(),
          saveProject: awsSaveProject(projects),
          storagePersistence,
        }}
      >
        <App />
      </UseCasesProvider>,
    );
    return { storagePersistence };
  }

  /** Creates "Orders service" from the projects screen, and waits for it to open. */
  async function createOrdersService() {
    const field = await screen.findByRole("textbox", { name: "Project name" });
    fireEvent.change(field, { target: { value: "Orders service" } });
    fireEvent.click(screen.getByRole("button", { name: "Create blank" }));
    return screen.findByRole("heading", { name: "Orders service", level: 2 });
  }

  // Fails if a blank project stays on the list instead of opening, opens
  // without its name in the breadcrumb, shows an empty diagram without the
  // prompt, or doesn't ask for persistent storage as a template copy does.
  it("opens a new blank project, named, with the empty diagram's prompt", async () => {
    const { storagePersistence } = await renderApp();

    const heading = await createOrdersService();

    expect(document.activeElement).toBe(heading);
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb.textContent).toBe("Projects›Orders service");
    expect(screen.getByText(PROMPT)).toBeTruthy();
    expect(
      screen.queryByRole("group", { name: /Architecture diagram/ }),
    ).toBeNull();
    expect(storagePersistence.request).toHaveBeenCalledOnce();
  });

  // Fails if the prompt outlives the first component, or the diagram and
  // its text version don't come back to show it.
  it("replaces the prompt with the diagram once a component is added", async () => {
    await renderApp();
    await createOrdersService();

    fireEvent.click(screen.getByRole("button", { name: "Add component" }));
    const types = screen.getByRole("list", { name: "Component types" });
    const lambda = within(types)
      .getAllByRole("button")
      .find((button) => button.textContent.startsWith("Lambda:"));
    if (lambda === undefined) throw new Error("No Lambda type");
    fireEvent.click(lambda);

    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(
      screen.getByRole("group", {
        name: "Architecture diagram of Orders service",
      }),
    ).toBeTruthy();
    const components = screen.getByRole("list", { name: "Components" });
    expect(components.textContent).toBe("lambda-1 (lambda)");
  });

  // Fails if the new project isn't saved, or is saved without a later
  // `updatedAt` than the sample, so going back doesn't list it first.
  it("lists the new project first on going back", async () => {
    await renderApp();
    await createOrdersService();

    fireEvent.click(screen.getByRole("button", { name: "Projects" }));

    await screen.findByRole("button", { name: "Orders service" });
    const listed = within(
      screen.getByRole("region", { name: "Your projects" }),
    ).getAllByRole("button");
    expect(listed.map((button) => button.textContent)).toEqual([
      "Orders service",
      "Sample project",
    ]);
  });
});

describe("App storage persistence", () => {
  beforeEach(() => {
    stubDiagramBrowserApis();
    stubWindowWidth("wide");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const CREATE_SAMPLE = "Create a project from Sample project";
  const HINT = /may clear your projects/;

  function renderAppWith(storagePersistence: StoragePersistence) {
    const { useCases } = inMemoryUseCases([sampleRecord]);
    render(
      <UseCasesProvider useCases={{ ...useCases, storagePersistence }}>
        <App />
      </UseCasesProvider>,
    );
  }

  function answering(status: PersistenceStatus) {
    return { request: vi.fn(() => Promise.resolve(status)) };
  }

  async function createSample() {
    fireEvent.click(await screen.findByLabelText(CREATE_SAMPLE));
    await waitFor(() => {
      expect(
        screen.getByLabelText(CREATE_SAMPLE).getAttribute("aria-disabled"),
      ).toBe("false");
    });
  }

  it("asks only after the first project is created, and only once", async () => {
    const storage = answering("persisted");
    renderAppWith(storage);
    await screen.findByLabelText(CREATE_SAMPLE);
    expect(storage.request).not.toHaveBeenCalled();

    await createSample();
    await createSample();

    expect(storage.request).toHaveBeenCalledOnce();
  });

  it("shows no hint when the browser keeps the projects", async () => {
    const storage = answering("persisted");
    renderAppWith(storage);

    await createSample();

    await waitFor(() => {
      expect(storage.request).toHaveBeenCalledOnce();
    });
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it.each<PersistenceStatus>(["best-effort", "unsupported"])(
    "warns that storage may be cleared when the answer is %s",
    async (status) => {
      renderAppWith(answering(status));

      await createSample();

      expect(await screen.findByText(HINT)).toBeTruthy();
    },
  );

  it("warns that storage may be cleared when the request fails", async () => {
    renderAppWith({
      request: () => Promise.reject(new Error("SecurityError")),
    });

    await createSample();

    expect(await screen.findByText(HINT)).toBeTruthy();
  });
});

describe("StartupFailure", () => {
  it("says the app couldn't start and shows the error", () => {
    const html = renderToString(
      <StartupFailure error={new Error("UnknownError: open failed")} />,
    );

    expect(html).toContain("couldn&#x27;t start");
    expect(html).toContain("UnknownError: open failed");
  });
});
