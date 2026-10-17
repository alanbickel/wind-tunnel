import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { fakeUseCases } from "./app/testing/fake-use-cases";
import { UseCasesProvider } from "./app/UseCasesProvider";
import { StartupFailure } from "./StartupFailure";

describe("App", () => {
  it("renders the app title", () => {
    const html = renderToString(
      <UseCasesProvider useCases={fakeUseCases()}>
        <App />
      </UseCasesProvider>,
    );

    expect(html).toContain("Wind Tunnel");
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
