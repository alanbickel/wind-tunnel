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

const statusContent: TimeSeriesContent = {
  title: "Requests that succeeded and failed",
  unit: "requests",
  series: [
    {
      id: "started",
      label: "Started",
      points: [{ timeSec: 1, value: 9 }],
    },
    {
      id: "succeeded",
      label: "Succeeded",
      status: "ok",
      points: [{ timeSec: 1, value: 8 }],
    },
    {
      id: "failed",
      label: "Failed",
      status: "error",
      points: [{ timeSec: 1, value: 1 }],
    },
  ],
};

function renderPlot(shown: TimeSeriesContent = content) {
  return render(
    <ChartPlot content={shown} rows={chartRows(shown.series)} size="full" />,
  );
}

/** Each legend swatch's stroke and dash pattern, in legend order. */
function legendSwatches(container: HTMLElement) {
  return [...container.querySelectorAll(".recharts-legend-icon")].map(
    (path) => [
      path.getAttribute("stroke"),
      path.getAttribute("stroke-dasharray"),
    ],
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

  // Fails if the legend draws its default icon, which ignores the dash, so
  // the legend tells Succeeded and Failed apart by color alone, or a
  // series' status doesn't reach its line, whose color the swatch takes.
  it("shows each line's color and dash in its legend swatch", () => {
    const { container } = renderPlot(statusContent);

    expect(legendSwatches(container)).toEqual([
      ["#2a78d6", null],
      ["var(--color-status-ok)", null],
      ["var(--color-status-error)", "6 3"],
    ]);
  });
});
