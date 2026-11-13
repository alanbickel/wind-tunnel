/**
 * What the canvas can do to its own view. `Diagram` reports them once React
 * Flow has loaded, so buttons outside the canvas can zoom it.
 */
export interface ZoomActions {
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  /** Fits the boxes in, clear of what covers the canvas's right edge. */
  readonly fit: () => void;
}
