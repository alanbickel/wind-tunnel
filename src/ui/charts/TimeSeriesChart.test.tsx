// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import type { TimeSeriesContent } from "./time-series";
import { TimeSeriesChart } from "./TimeSeriesChart";

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

describe("TimeSeriesChart", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("is a figure named by its title", () => {
    render(<TimeSeriesChart content={content} />);

    expect(
      screen.getByRole("figure", { name: "Requests per second" }),
    ).toBeTruthy();
  });

  it("lists the legend in series order, not alphabetically", () => {
    // Recharts sorts the legend by label unless told otherwise, which put
    // "Failed" before "Started" and out of step with the table.
    stubDiagramBrowserApis();
    const { container } = render(<TimeSeriesChart content={content} />);

    const items = [...container.querySelectorAll(".recharts-legend-item")];
    expect(items.map((item) => item.textContent)).toEqual([
      "Started",
      "Failed",
    ]);
  });

  it("repeats its numbers in a table, a row per time, gaps marked", () => {
    render(<TimeSeriesChart content={content} />);

    const table = screen.getByRole("table", {
      name: "Requests per second (requests)",
    });
    const rows = within(table)
      .getAllByRole("row")
      .map((row) =>
        [...row.querySelectorAll("th, td")].map((cell) => cell.textContent),
      );
    expect(rows).toEqual([
      ["Time (s)", "Started", "Failed"],
      ["1", "1,200", "–"],
      ["2", "900", "3"],
    ]);
  });
});
