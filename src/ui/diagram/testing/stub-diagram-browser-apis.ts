import { vi } from "vitest";

/**
 * Stubs the browser APIs React Flow needs that jsdom lacks, as React Flow's
 * testing guide recommends. Call it in `beforeEach` of any jsdom test that
 * renders a `Diagram`; `vi.unstubAllGlobals()` undoes it.
 */
export function stubDiagramBrowserApis(): void {
  // Observes nothing: jsdom lays nothing out, so there's nothing to report.
  vi.stubGlobal(
    "ResizeObserver",
    vi.fn(function inertResizeObserver() {
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    }),
  );
  // An identity transform: React Flow reads only `m22` (the zoom) from it.
  vi.stubGlobal(
    "DOMMatrixReadOnly",
    vi.fn(function identityMatrix() {
      return { m22: 1 };
    }),
  );
}

/** What a stubbed `ResizeObserver` reports to. */
type ResizeCallback = (entries: readonly ResizeEntry[]) => void;

/** The part of a `ResizeObserverEntry` React Flow reads. */
interface ResizeEntry {
  readonly target: Element;
  readonly contentRect: DOMRectReadOnly;
}

/**
 * A `ResizeObserver` that reports each element it's asked to observe, a
 * tick later, as a browser's does a frame later. React Flow measures a box
 * only then, so a test can see a box that's hidden while it waits. Call it
 * after `stubDiagramBrowserApis`; `vi.unstubAllGlobals()` undoes it.
 */
export function stubMeasuringResizeObserver(): void {
  vi.stubGlobal(
    "ResizeObserver",
    vi.fn(function measuringResizeObserver(callback: ResizeCallback) {
      return {
        observe: (target: Element) => {
          setTimeout(() => {
            callback([{ target, contentRect: target.getBoundingClientRect() }]);
          }, 0);
        },
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    }),
  );
}
