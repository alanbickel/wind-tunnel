import { vi } from "vitest";

/** Which side of `--breakpoint-wide` the window is on. */
export type WindowWidth = "wide" | "narrow";

/**
 * Stubs `matchMedia`, which jsdom lacks, so `useWideWindow` sees a window
 * of this width. Every query matches in a wide window and none in a narrow
 * one; the width never changes. Call it in `beforeEach` of any jsdom test
 * that renders a project screen; `vi.unstubAllGlobals()` undoes it.
 */
export function stubWindowWidth(width: WindowWidth): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(function fixedWidth(query: string) {
      return {
        matches: width === "wide",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    }),
  );
}
