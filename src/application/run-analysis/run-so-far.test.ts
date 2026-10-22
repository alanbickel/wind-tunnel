import { describe, expect, it } from "vitest";
import { sampleRecord } from "../testing/sample-record";
import { sampleSnapshot } from "../testing/sample-snapshots";
import { runFinished } from "./run-so-far";

const { project } = sampleRecord;

/** The first `n` seconds of `sampleRecord`'s 5 s `steady` workload. */
function firstSeconds(n: number) {
  return Array.from({ length: n }, (_, i) => sampleSnapshot({ second: i + 1 }));
}

describe("runFinished", () => {
  // Fails if it counts snapshots, or compares the last snapshot's end with
  // anything but the workload's duration.
  it.each([
    [0, false],
    [4, false],
    [5, true],
  ])("after %i of 5 seconds is %s", (n, finished) => {
    const snapshots = firstSeconds(n);
    expect(runFinished({ project, workloadId: "steady", snapshots })).toBe(
      finished,
    );
  });

  // Fails if a workload the project doesn't have counts as finished.
  it("is false for a workload the project doesn't have", () => {
    const snapshots = firstSeconds(5);
    expect(runFinished({ project, workloadId: "missing", snapshots })).toBe(
      false,
    );
  });
});
