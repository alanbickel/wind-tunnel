import { describe, expect, it } from "vitest";
import { FIT } from "./fit-options";

describe("FIT", () => {
  // Fails if the fit leaves one edge more room than the others, as it did
  // for the inspector that floated over the canvas's right, which nothing
  // covers now.
  it("leaves the same margin on every side", () => {
    expect(FIT.padding).toBe(0.1);
  });

  // Fails if a fit can zoom in past the boxes' own size, drawing a small
  // architecture huge on a window-sized canvas.
  it("never zooms past the boxes' own size", () => {
    expect(FIT.maxZoom).toBe(1);
  });
});
