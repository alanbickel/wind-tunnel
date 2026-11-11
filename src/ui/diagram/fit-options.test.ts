import { describe, expect, it } from "vitest";
import { fitOptions, OPENING_FIT } from "./fit-options";

describe("fitOptions", () => {
  // Fails if the fit stops padding the right edge by what covers it, so
  // the boxes on the right are drawn under the inspector.
  it("pads the right edge by what covers it, plus the margin", () => {
    expect(fitOptions({ width: 1000, coveredRightPx: 400 }).padding).toEqual({
      top: 0.1,
      bottom: 0.1,
      left: 0.1,
      right: "450px",
    });
  });

  // Fails if an uncovered diagram loses its right margin.
  it("keeps the margin on the right with nothing covering it", () => {
    expect(
      fitOptions({ width: 1000, coveredRightPx: 0 }).padding,
    ).toMatchObject({ right: "50px" });
  });

  // Fails if a fit can zoom in past the boxes' own size, drawing a small
  // architecture huge on a window-sized canvas, before or after measuring.
  it("never zooms past the boxes' own size", () => {
    expect(fitOptions({ width: 1000, coveredRightPx: 400 }).maxZoom).toBe(1);
    expect(OPENING_FIT.maxZoom).toBe(1);
  });
});
