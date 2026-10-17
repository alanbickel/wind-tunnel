// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { sampleRecord } from "../application/testing/sample-record";
import { App } from "./App";
import { inMemoryUseCases } from "./app/testing/in-memory-use-cases";
import { UseCasesProvider } from "./app/UseCasesProvider";
import { StartupFailure } from "./StartupFailure";

describe("App", () => {
  afterEach(cleanup);

  it("opens a project from the list and goes back to the list", async () => {
    const { useCases, projects } = inMemoryUseCases([]);
    await projects.save(sampleRecord);
    render(
      <UseCasesProvider useCases={useCases}>
        <App />
      </UseCasesProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Sample project" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Sample project" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "← All projects" }));
    expect(
      await screen.findByRole("heading", { name: "Your projects" }),
    ).toBeTruthy();
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
