// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { LoadableView } from "./LoadableView";
import type { Loadable } from "./useLoad";

function view(loadable: Loadable<string>) {
  return (
    <LoadableView loadable={loadable} what="the thing">
      {(value) => <p>{value}</p>}
    </LoadableView>
  );
}

describe("LoadableView", () => {
  afterEach(cleanup);

  // Fails if the status region is added together with its text, or is
  // replaced by a new element when the load finishes, instead of staying
  // mounted and changing only its text.
  it("keeps one status region and changes only its text", async () => {
    const { rerender } = render(view({ status: "loading" }));
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("");
    await waitFor(() => {
      expect(region.textContent).toBe("Loading the thing…");
    });

    rerender(view({ status: "loaded", value: "done" }));

    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toBe("");
    expect(screen.getByText("done")).toBeTruthy();
  });

  // Fails if the first render already holds the loading text, which a
  // screen reader skips in a region that has just appeared.
  it("renders the region empty before its first text", () => {
    // A server render runs no effects, so it is the first render alone.
    const firstRender = renderToString(view({ status: "loading" }));

    expect(firstRender).toBe('<p role="status"></p>');
  });

  // Fails if a failed load drops the alert or leaves loading text behind.
  it("shows a failure in an alert and clears the status text", () => {
    render(view({ status: "failed", error: new Error("boom") }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Couldn't load the thing: Error: boom",
    );
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
