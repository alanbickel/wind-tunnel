import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { fakeUseCases } from "./app/testing/fake-use-cases";
import { StartupFailure } from "./StartupFailure";

describe("App", () => {
  it("renders the app title", () => {
    expect(renderToString(<App useCases={fakeUseCases()} />)).toContain(
      "Wind Tunnel",
    );
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
