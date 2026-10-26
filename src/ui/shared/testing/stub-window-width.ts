import { vi } from "vitest";

/** Which side of `--breakpoint-wide` the window is on. */
export type WindowWidth = "wide" | "narrow";

/** Moves the stubbed window to a width, as resizing or zooming would. */
export type ResizeWindow = (width: WindowWidth) => void;

/**
 * Stubs `matchMedia`, which jsdom lacks, so `useWideWindow` sees a window
 * of this width. Every query matches in a wide window and none in a narrow
 * one, until the returned function moves it, which tells the listeners;
 * call that inside `act`. Call this in `beforeEach` of any jsdom test that
 * renders a project screen; `vi.unstubAllGlobals()` undoes it.
 */
export function stubWindowWidth(initial: WindowWidth): ResizeWindow {
  let width = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(function stubbedWidth(query: string) {
      return {
        get matches() {
          return width === "wide";
        },
        media: query,
        addEventListener: (_type: string, listener: () => void) => {
          listeners.add(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => {
          listeners.delete(listener);
        },
      };
    }),
  );
  return (next) => {
    width = next;
    listeners.forEach((listener) => {
      listener();
    });
  };
}
