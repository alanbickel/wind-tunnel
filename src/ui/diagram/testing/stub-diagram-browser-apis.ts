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
