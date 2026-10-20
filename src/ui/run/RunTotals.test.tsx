// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import type { LimitUse } from "../../domain/metrics/metrics-snapshot";
import { RunTotals } from "./RunTotals";

const { project } = sampleRecord;

const concurrency = (peak: number): LimitUse => ({
  kind: "concurrency",
  name: "concurrency",
  limit: 10,
  current: 0,
  peak,
});

/** A bucket of 5,000 refilling at 10,000 per second. */
const requestRate = (peak: number, takenPerSec: number): LimitUse => ({
  kind: "rate",
  name: "requestRate",
  limit: 5_000,
  current: 0,
  peak,
  ratePerSec: 10_000,
  takenPerSec,
});

/** Each body row of the limits table as its cells' text. */
function limitRows(): string[][] {
  const table = screen.getByRole("table", {
    name: "Busiest use of each limit so far",
  });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      [...row.querySelectorAll("th, td")].map((cell) => cell.textContent),
    );
}

describe("RunTotals", () => {
  afterEach(cleanup);

  // Fails if the table shows the latest second's peak or flow instead of
  // the highest, drops a limit, or leaves out what a rate's numbers count.
  it("shows each limit's highest use so far against the limit", () => {
    const snapshots = [
      sampleSnapshot({
        second: 1,
        api: { limits: [requestRate(1_250, 2_076)] },
        fn: { limits: [concurrency(10)] },
      }),
      sampleSnapshot({
        second: 2,
        api: { limits: [requestRate(400, 900)] },
        fn: { limits: [concurrency(3)] },
      }),
    ];
    render(<RunTotals run={{ project, snapshots }} />);
    expect(limitRows()).toEqual([
      [
        "API requestRate, tokens drawn",
        "1,250",
        "5,000",
        "25%",
        "2,076 of 10,000 per s",
      ],
      ["Function concurrency", "10", "10", "100%", "–"],
    ]);
  });

  // Fails if the table is drawn, empty, before any snapshot has a limit.
  it("leaves the limits table out until a snapshot reports a limit", () => {
    render(
      <RunTotals
        run={{ project, snapshots: [sampleSnapshot({ second: 1 })] }}
      />,
    );
    expect(
      screen.queryByRole("table", { name: "Busiest use of each limit so far" }),
    ).toBeNull();
  });
});
