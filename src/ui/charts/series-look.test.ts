import { describe, expect, it } from "vitest";
import { SERIES_COLORS } from "./series-colors";
import { seriesLook } from "./series-look";
import type { TimeSeries } from "./time-series";

function series(status?: TimeSeries["status"]): TimeSeries {
  return { id: "line", label: "Line", status, points: [] };
}

describe("seriesLook", () => {
  // Fails if a status line takes the series color for its place, as
  // Succeeded and Failed did (orange and aqua), or Failed loses its dash,
  // the cue besides color.
  it("draws a status line in its status token, dashed for an error", () => {
    expect(seriesLook({ series: series("ok"), index: 1 })).toEqual({
      stroke: "var(--color-status-ok)",
    });
    expect(seriesLook({ series: series("error"), index: 2 })).toEqual({
      stroke: "var(--color-status-error)",
      strokeDasharray: "6 3",
    });
  });

  // Fails if a line without a status stops taking the color for its place
  // in the list, so lines change color as the run fills in.
  it("draws a line without a status in the series color for its place", () => {
    expect(seriesLook({ series: series(), index: 3 })).toEqual({
      stroke: SERIES_COLORS[3],
    });
  });
});
