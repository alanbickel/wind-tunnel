import type { FitViewOptions } from "@xyflow/react";

/** One side's padding, as React Flow takes it: a share of the box, or pixels. */
type SidePadding = number | `${number}px`;

/** A length in pixels, as React Flow reads one: "80px". */
function pixels(lengthPx: number): `${number}px` {
  // String() of a number is that number's text, which the template type says.
  return `${String(lengthPx)}px` as `${number}px`;
}

/**
 * The room left around the boxes when the diagram fits them, as React
 * Flow reads a number: about 5% of the box on each side, its default.
 */
const FIT_MARGIN = 0.1;

/**
 * The most a fit zooms in: the boxes at their own size. A diagram that
 * fills a window would otherwise draw a small architecture huge.
 */
const FIT_MAX_ZOOM = 1;

/**
 * How to fit the boxes, on opening, on Fit, and whenever the canvas
 * changes size: at most at their own size, with the same margin on every
 * side, except that the left leaves `leftInsetPx` instead when something
 * covers the canvas's left edge (the tool rail), so no box is fitted
 * under it. With no inset, the left's margin is the others'.
 */
export function fitOptions(leftInsetPx: number): FitViewOptions {
  const left: SidePadding = leftInsetPx > 0 ? pixels(leftInsetPx) : FIT_MARGIN;
  return {
    maxZoom: FIT_MAX_ZOOM,
    padding: { top: FIT_MARGIN, right: FIT_MARGIN, bottom: FIT_MARGIN, left },
  };
}

/** The fit with nothing covering the canvas. */
export const FIT: FitViewOptions = fitOptions(0);
