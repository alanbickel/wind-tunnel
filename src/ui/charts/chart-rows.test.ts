import { describe, expect, it } from "vitest";
import { chartRows } from "./chart-rows";

describe("chartRows", () => {
  it("merges series into one row per time, in time order", () => {
    const rows = chartRows([
      {
        id: "a",
        label: "A",
        points: [
          { timeSec: 2, value: 20 },
          { timeSec: 1, value: 10 },
        ],
      },
      { id: "b", label: "B", points: [{ timeSec: 1, value: 5 }] },
    ]);

    expect(rows).toEqual([
      { timeSec: 1, values: { a: 10, b: 5 } },
      { timeSec: 2, values: { a: 20 } },
    ]);
  });

  it("has no rows without points", () => {
    expect(chartRows([{ id: "a", label: "A", points: [] }])).toEqual([]);
  });
});
