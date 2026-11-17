import { describe, expect, it } from "vitest";
import { FIT, fitOptions } from "./fit-options";

describe("fitOptions", () => {
  // Fails if the fit leaves one edge more room than the others while
  // nothing covers the canvas.
  it("leaves the same margin on every side with no inset", () => {
    expect(FIT.padding).toEqual({
      top: 0.1,
      right: 0.1,
      bottom: 0.1,
      left: 0.1,
    });
  });

  // Fails if the inset isn't the left's padding in pixels, or changes the
  // other sides: a fit would put the left boxes under the tool rail.
  it("leaves the inset clear on the left, in pixels", () => {
    expect(fitOptions(80).padding).toEqual({
      top: 0.1,
      right: 0.1,
      bottom: 0.1,
      left: "80px",
    });
  });

  // Fails if a fit can zoom in past the boxes' own size, drawing a small
  // architecture huge on a window-sized canvas.
  it("never zooms past the boxes' own size", () => {
    expect(FIT.maxZoom).toBe(1);
  });
});
