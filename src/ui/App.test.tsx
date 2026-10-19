// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PersistenceStatus,
  StoragePersistence,
} from "../application/ports/storage-persistence";
import { sampleRecord } from "../application/testing/sample-record";
import { App } from "./App";
import { inMemoryUseCases } from "./app/testing/in-memory-use-cases";
import { UseCasesProvider } from "./app/UseCasesProvider";
import { StartupFailure } from "./StartupFailure";
import { stubDiagramBrowserApis } from "./diagram/testing/stub-diagram-browser-apis";

describe("App", () => {
  beforeEach(stubDiagramBrowserApis);
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
});

describe("App storage persistence", () => {
  beforeEach(stubDiagramBrowserApis);
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
