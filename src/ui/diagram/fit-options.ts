import type { FitViewOptions } from "@xyflow/react";

/**
 * The room left around the boxes when the diagram fits them, as React
 * Flow reads a number: about 5% of the box on each side, its default.
 */
const FIT_MARGIN = 0.1;

/** The same room, in pixels, beside what covers the right edge. */
const FIT_MARGIN_SHARE = 0.05;

/**
 * The most a fit zooms in: the boxes at their own size. A diagram that
 * fills a window would otherwise draw a small architecture huge.
 */
const FIT_MAX_ZOOM = 1;

/** The diagram's width, and how much of its right edge is covered. */
export interface FitInput {
  readonly width: number;
  readonly coveredRightPx: number;
}

/** How to fit the boxes: clear of the covered right edge, at most at their size. */
export function fitOptions({
  width,
  coveredRightPx,
}: FitInput): FitViewOptions {
  const right = Math.floor(coveredRightPx + width * FIT_MARGIN_SHARE);
  return {
    maxZoom: FIT_MAX_ZOOM,
    padding: {
      top: FIT_MARGIN,
      bottom: FIT_MARGIN,
      left: FIT_MARGIN,
      right: `${String(right)}px` as `${number}px`,
    },
  };
}

/** The first fit, before the box is measured: at most at the boxes' size. */
export const OPENING_FIT: FitViewOptions = { maxZoom: FIT_MAX_ZOOM };
