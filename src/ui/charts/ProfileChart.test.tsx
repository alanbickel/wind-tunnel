// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { ProfileChart } from "./ProfileChart";
import { rateRows, type RateLineContent } from "./rate-line";

const line: RateLineContent = {
  within: [
    { timeSec: 0, requestsPerSec: 200 },
    { timeSec: 45, requestsPerSec: 1100 },
  ],
  beyond: [
    { timeSec: 45, requestsPerSec: 1100 },
    { timeSec: 50, requestsPerSec: 200 },
  ],
  endSec: 45,
  endText: "Run ends at 45 s",
};

// What Tab stops on. Recharts gives its layers `tabindex="-1"`, which
// leaves them out of the tab order.
const TAB_STOPS =
  '[tabindex]:not([tabindex="-1"]), a[href], button, input, select, textarea';

describe("ProfileChart", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the chart loses its short label or the words that say where the
  // run ends, or if the drawn plot puts anything in the tab order
  // (`accessibilityLayer` on gives its surface `tabindex="0"`): the table is
  // how it's read.
  it("has a label, says where the run ends, and has nothing to focus", async () => {
    stubDiagramBrowserApis();
    const { container } = render(<ProfileChart line={line} />);

    expect(
      screen.getByRole("figure", { name: "Request rate over time" }),
    ).toBeTruthy();
    expect(screen.getByText("Run ends at 45 s")).toBeTruthy();
    await waitFor(() => {
      expect(container.querySelector(".recharts-surface")).not.toBeNull();
    });
    expect(container.querySelectorAll(TAB_STOPS)).toHaveLength(0);
  });

  // Fails if a profile with no points draws a chart.
  it("draws nothing for an empty line", () => {
    render(<ProfileChart line={{ ...line, within: [], beyond: [] }} />);

    expect(screen.queryByRole("figure")).toBeNull();
  });
});

describe("rateRows", () => {
  // Fails if the run's end, which both lines have, becomes two rows, or a
  // row gives either line a value it doesn't have.
  it("joins the lines at the run's end, one row per time", () => {
    expect(rateRows(line)).toEqual([
      { timeSec: 0, within: 200, beyond: undefined },
      { timeSec: 45, within: 1100, beyond: 1100 },
      { timeSec: 50, within: undefined, beyond: 200 },
    ]);
  });
});
