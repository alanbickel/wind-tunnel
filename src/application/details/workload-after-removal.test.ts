import { describe, expect, it } from "vitest";
import type { Workload } from "../../domain/model/project";
import { sampleRecord } from "../testing/sample-record";
import { workloadAfterRemoval } from "./workload-after-removal";

const [steady] = sampleRecord.project.workloads;
if (steady === undefined) throw new Error("The sample has a workload");

const workloads: Workload[] = ["a", "b", "c"].map((id) => ({
  ...steady,
  id,
  name: id.toUpperCase(),
}));

/** The id of the workload picked once `removedId` goes. */
function pickedAfter(removedId: string, from = workloads): string | undefined {
  return workloadAfterRemoval({ workloads: from, removedId })?.id;
}

describe("workloadAfterRemoval", () => {
  // Fails if the pick isn't the next workload in the list.
  it("picks the one after", () => {
    expect(pickedAfter("a")).toBe("b");
    expect(pickedAfter("b")).toBe("c");
  });

  // Fails if the last one's removal picks nothing, or the first.
  it("picks the one before when the last goes", () => {
    expect(pickedAfter("c")).toBe("b");
  });

  // Fails if the only workload's removal picks something, or an id the
  // list doesn't have does.
  it("picks nothing when none is left, or the id isn't there", () => {
    expect(pickedAfter("a", workloads.slice(0, 1))).toBeUndefined();
    expect(pickedAfter("gone")).toBeUndefined();
  });
});
