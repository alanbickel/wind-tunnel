import { describe, expect, it } from "vitest";
import { sampleSnapshot } from "../testing/sample-snapshots";
import { workflowSeconds } from "./workflow-seconds";

// 5 requests start in second 1; 2 succeed in it. In second 2, 1 more
// succeeds, 1 fails, and 3 more start. So 3 are unanswered after second 1,
// and 4 after second 2.
const snapshots = [
  sampleSnapshot({ second: 1, read: { started: 5, succeeded: 2 } }),
  sampleSnapshot({ second: 2, read: { started: 3, succeeded: 1, failed: 1 } }),
];

describe("workflowSeconds", () => {
  // Fails if the running total resets each second, or if it leaves out
  // failed requests.
  it("counts each second and carries the in-progress total forward", () => {
    const seconds = workflowSeconds(snapshots);

    expect(
      seconds.map(({ started, succeeded, failed, inProgress }) => ({
        started,
        succeeded,
        failed,
        inProgress,
      })),
    ).toEqual([
      { started: 5, succeeded: 2, failed: 0, inProgress: 3 },
      { started: 3, succeeded: 1, failed: 1, inProgress: 4 },
    ]);
    expect(seconds.map((s) => s.snapshot)).toEqual(snapshots);
  });
});
