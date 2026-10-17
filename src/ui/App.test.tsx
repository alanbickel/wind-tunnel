// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

    fireEvent.click(screen.getByRole("button", { name: "← All projects" }));

    const button = await screen.findByRole("button", {
      name: "Sample project",
    });
    expect(document.activeElement).toBe(button);
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
