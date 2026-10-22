import { describe, expect, it } from "vitest";
import { sampleRecord } from "../testing/sample-record";
import { allWorkflows, componentTotals, workflowTotals } from "./run-totals";
import { sampleSnapshot } from "../testing/sample-snapshots";

const { project } = sampleRecord;

// 5 requests start in second 1; 2 succeed in it. In second 2, 1 more
// succeeds, 1 fails, and 3 more start. So 4 are unanswered after second 2.
const snapshots = [
  sampleSnapshot({
    second: 1,
    read: { started: 5, succeeded: 2 },
    fn: { arrivals: 5, completed: 2 },
  }),
  sampleSnapshot({
    second: 2,
    read: { started: 3, succeeded: 1, failed: 1 },
    fn: { arrivals: 3, completed: 1, failed: 1, rejected: 2 },
  }),
];

describe("workflowTotals", () => {
  // Fails if a snapshot is dropped from the sums, or in progress isn't
  // started minus answered.
  it("adds up the snapshots and shows what's still in progress", () => {
    expect(
      workflowTotals({ project, workloadId: "steady", snapshots }),
    ).toEqual([
      {
        id: "read",
        label: "Read item",
        started: 8,
        succeeded: 3,
        failed: 1,
        inProgress: 4,
      },
    ]);
  });

  // Fails if no snapshots means no rows instead of a row of zeros.
  it("is all zeros before the first snapshot", () => {
    const [read] = workflowTotals({
      project,
      workloadId: "steady",
      snapshots: [],
    });
    expect(read).toMatchObject({ started: 0, inProgress: 0 });
  });
});

describe("allWorkflows", () => {
  it("sums every column, so its own columns still reconcile", () => {
    const rows = [
      {
        id: "a",
        label: "A",
        started: 5,
        succeeded: 2,
        failed: 1,
        inProgress: 2,
      },
      {
        id: "b",
        label: "B",
        started: 4,
        succeeded: 3,
        failed: 0,
        inProgress: 1,
      },
    ];

    const all = allWorkflows(rows);

    expect(all).toEqual({
      id: "all",
      label: "All workflows",
      started: 9,
      succeeded: 5,
      failed: 1,
      inProgress: 3,
    });
    expect(all.started).toBe(all.succeeded + all.failed + all.inProgress);
  });
});

describe("componentTotals", () => {
  // Fails if the rows leave architecture order, or unfinished isn't
  // arrivals minus completed, failed, and rejected.
  it("lists every component in architecture order, with unfinished work", () => {
    const rows = componentTotals({ project, workloadId: "steady", snapshots });

    expect(rows.map((r) => r.label)).toEqual(["API", "Function", "Table"]);
    expect(rows[1]).toEqual({
      id: "fn",
      label: "Function",
      arrivals: 8,
      completed: 3,
      failed: 1,
      rejected: 2,
      unfinished: 2,
    });
  });
});
