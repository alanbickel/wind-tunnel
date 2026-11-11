import { useLayoutEffect, useState, type RefCallback } from "react";

/** How much of the canvas's right edge the inspector covers, and the refs that measure it. */
export interface CoveredWidth {
  /** For the box the canvas and the inspector share. */
  readonly screenRef: RefCallback<HTMLElement>;
  /** For the inspector, while it floats over the canvas. */
  readonly inspectorRef: RefCallback<HTMLElement>;
  /** From the inspector's left edge to the box's right; 0 with no inspector. */
  readonly coveredRightPx: number;
}

/**
 * Measures how much of the canvas the floating inspector covers, again
 * whenever the window or the inspector changes size (it collapses to a
 * strip), so the diagram can fit its boxes clear of it. A narrow window,
 * whose inspector is under the canvas, covers none.
 */
export function useCoveredWidth(): CoveredWidth {
  const [screen, setScreen] = useState<HTMLElement | null>(null);
  const [inspector, setInspector] = useState<HTMLElement | null>(null);
  const [coveredRightPx, setCoveredRightPx] = useState(0);
  useLayoutEffect(() => {
    if (screen === null || inspector === null) return undefined;
    // jsdom has no ResizeObserver; tests stub it where the diagram needs one.
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      setCoveredRightPx(Math.max(0, screen.clientWidth - inspector.offsetLeft));
    });
    observer.observe(screen);
    observer.observe(inspector);
    return () => {
      observer.disconnect();
    };
  }, [screen, inspector]);
  return {
    screenRef: setScreen,
    inspectorRef: setInspector,
    coveredRightPx: inspector === null ? 0 : coveredRightPx,
  };
}
