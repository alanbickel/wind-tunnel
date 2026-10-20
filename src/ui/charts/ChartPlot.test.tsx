// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { ChartPlot } from "./ChartPlot";
import { chartRows } from "./chart-rows";
import type { TimeSeriesContent } from "./time-series";

const content: TimeSeriesContent = {
  title: "Requests per second",
  unit: "requests",
  series: [
    {
      id: "started",
      label: "Started",
      points: [
        { timeSec: 1, value: 1_200 },
        { timeSec: 2, value: 900 },
      ],
    },
    { id: "failed", label: "Failed", points: [{ timeSec: 2, value: 3 }] },
  ],
};

function renderPlot() {
  return render(
    <ChartPlot content={content} rows={chartRows(content.series)} />,
  );
}

describe("ChartPlot", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the Legend loses its `itemSorter`: Recharts sorts the legend
  // by label, giving ["Failed", "Started"], out of step with the table.
  it("lists the legend in series order, not alphabetically", () => {
    const { container } = renderPlot();

    const items = [...container.querySelectorAll(".recharts-legend-item")];
    expect(items.map((item) => item.textContent)).toEqual([
      "Started",
      "Failed",
    ]);
  });

  // Fails if the legend's labels take their line's color: series colors
  // only reach 3:1, and a label is text.
  it("writes the legend labels in the text color", () => {
    const { container } = renderPlot();

    const labels = [
      ...container.querySelectorAll(".recharts-legend-item-text"),
    ];
    expect(labels.map((label) => label.getAttribute("style"))).toEqual([
      expect.stringContaining("color: var(--color-text)"),
      expect.stringContaining("color: var(--color-text)"),
    ]);
  });
});
