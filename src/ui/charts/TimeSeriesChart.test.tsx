// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { preloadBeforeAll } from "../shared/testing/preload-before-all";
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
  preloadBeforeAll(() => import("./ChartPlot"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if TimeSeriesChart renders the lazy plot without its own Suspense
  // boundary: the figure waits for Recharts to load. Keep it first: later
  // tests find the plot already loaded.
  it("is a figure named by its title", () => {
    render(<TimeSeriesChart content={content} />);

    expect(
      screen.getByRole("figure", { name: "Requests per second" }),
    ).toBeTruthy();
  });

  // Fails if TimeSeriesChart stops rendering ChartPlot: the stand-in stays.
  it("draws the lines once Recharts has loaded", async () => {
    stubDiagramBrowserApis();
    const { container } = render(<TimeSeriesChart content={content} />);

    await waitFor(() => {
      expect(container.querySelectorAll(".recharts-line")).toHaveLength(2);
    });
    expect(screen.queryByText("Loading the chart…")).toBeNull();
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
