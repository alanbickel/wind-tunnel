// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectFrame } from "./ProjectFrame";
import { TEST_SHELL } from "./testing/canvas-panels";

/** Reports the observed element's change to the frame, as a browser would. */
let reportResize: () => void;

/** A ResizeObserver whose report the test sends, by `reportResize`. */
function stubResizeObserver(): void {
  vi.stubGlobal(
    "ResizeObserver",
    vi.fn(function heldResizeObserver(callback: () => void) {
      reportResize = () => {
        act(callback);
      };
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    }),
  );
}

/** Sets the height every element is measured at (jsdom lays nothing out). */
function measureAt(heightPx: number): void {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(
    heightPx,
  );
}

function scrollPaddingTop(): string {
  return document.documentElement.style.getPropertyValue("scroll-padding-top");
}

describe("ProjectFrame", () => {
  beforeEach(stubResizeObserver);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Fails if the page's top scroll padding doesn't follow the sticky top
  // bar's height, or outlives the frame: a focused heading the page scrolls
  // to would stop under the bar, or another screen would keep a gap.
  it("keeps what the page scrolls to below the top bar, as the bar's height changes", () => {
    measureAt(92);
    const { unmount } = render(
      <ProjectFrame shell={TEST_SHELL} current="Sample project">
        <p>Content</p>
      </ProjectFrame>,
    );
    reportResize();
    expect(scrollPaddingTop()).toBe("92px");

    measureAt(245);
    reportResize();
    expect(scrollPaddingTop()).toBe("245px");

    unmount();
    expect(scrollPaddingTop()).toBe("");
  });
});
