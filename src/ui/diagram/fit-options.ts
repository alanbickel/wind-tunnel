import type { FitViewOptions } from "@xyflow/react";

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
 * changes size: the same margin on every side, since nothing covers the
 * canvas, and at most at their own size.
 */
export const FIT: FitViewOptions = {
  maxZoom: FIT_MAX_ZOOM,
  padding: FIT_MARGIN,
};
