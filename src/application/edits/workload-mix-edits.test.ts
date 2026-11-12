import { describe, expect, it } from "vitest";
import type { MixEntry, Workflow } from "../../domain/model/project";
import { mixShares, shareText } from "../details/mix-shares";
import type { ProjectRecord } from "../ports/project-record";
import { sampleRecord } from "../testing/sample-record";
import { addToMix, removeFromMix, setMixWeight } from "./workload-edits";

const [sampleWorkflow] = sampleRecord.project.workflows;
if (sampleWorkflow === undefined) throw new Error("The sample has a workflow");

/** Three workflows, "a", "b", and "c". */
const workflows: Workflow[] = ["a", "b", "c"].map((id) => ({
  ...sampleWorkflow,
  id,
  name: `Flow ${id}`,
}));

/** The sample with three workflows and a workload "steady" with this mix. */
function recordWithMix(mix: MixEntry[]): ProjectRecord {
  const [steady] = sampleRecord.project.workloads;
  if (steady === undefined) throw new Error("The sample has a workload");
  const other = { ...steady, id: "other", name: "Other" };
  return {
    ...sampleRecord,
    project: {
      ...sampleRecord.project,
      workflows,
      workloads: [{ ...steady, mix }, other],
    },
  };
}

function copyOf(record: ProjectRecord): ProjectRecord {
  return JSON.parse(JSON.stringify(record)) as ProjectRecord;
}

function mixOf(record: ProjectRecord): readonly MixEntry[] | undefined {
  return record.project.workloads.find((w) => w.id === "steady")?.mix;
}

/** The shares the screen shows for the mix, as text, and their sum in tenths. */
function sharesOf(record: ProjectRecord): { text: string[]; tenths: number } {
  const shares = mixShares((mixOf(record) ?? []).map((e) => e.weight)) ?? [];
  return {
    text: shares.map(shareText),
    tenths: shares.reduce((sum, tenths) => sum + tenths, 0),
  };
}

describe("addToMix", () => {
  // Fails if the entry isn't appended last at weight 1, or the command
  // changes another workload, the workflows, or the input.
  it("appends an entry at weight 1, and nothing else", () => {
    const start = recordWithMix([{ workflowId: "b", weight: 5 }]);
    const before = copyOf(start);

    const next = addToMix(start, { workloadId: "steady", workflowId: "a" });

    expect(mixOf(next)).toEqual([
      { workflowId: "b", weight: 5 },
      { workflowId: "a", weight: 1 },
    ]);
    expect(next.project.workloads[1]).toBe(start.project.workloads[1]);
    expect(next.project.workflows).toBe(start.project.workflows);
    expect(start).toEqual(before);
  });

  // Fails if a workflow already in the mix, one the project doesn't have,
  // or a workload it doesn't have returns a new record: the screen offers
  // none of them, and a command shouldn't rely on its caller.
  it("returns the same record for a repeat, an unknown workflow, or no such workload", () => {
    const start = recordWithMix([{ workflowId: "b", weight: 5 }]);

    expect(addToMix(start, { workloadId: "steady", workflowId: "b" })).toBe(
      start,
    );
    expect(addToMix(start, { workloadId: "steady", workflowId: "z" })).toBe(
      start,
    );
    expect(addToMix(start, { workloadId: "gone", workflowId: "a" })).toBe(
      start,
    );
  });
});

describe("setMixWeight", () => {
  // Fails if the weight isn't set, the entry moves, or another entry, the
  // input, or another workload changes.
  it("sets one entry's weight, and nothing else", () => {
    const start = recordWithMix([
      { workflowId: "a", weight: 1 },
      { workflowId: "b", weight: 1 },
    ]);
    const before = copyOf(start);

    const next = setMixWeight(start, {
      workloadId: "steady",
      workflowId: "a",
      weight: 80,
    });

    expect(mixOf(next)).toEqual([
      { workflowId: "a", weight: 80 },
      { workflowId: "b", weight: 1 },
    ]);
    expect(next.project.workloads[1]).toBe(start.project.workloads[1]);
    expect(start).toEqual(before);
  });

  // Fails if the weight it already has, an entry that isn't there, or a
  // workload that isn't there returns a new record.
  it("returns the same record for the same weight, no such entry, or no such workload", () => {
    const start = recordWithMix([{ workflowId: "a", weight: 3 }]);
    const input = { workloadId: "steady", workflowId: "a", weight: 3 };

    expect(setMixWeight(start, input)).toBe(start);
    expect(setMixWeight(start, { ...input, workflowId: "b", weight: 4 })).toBe(
      start,
    );
    expect(
      setMixWeight(start, { ...input, workloadId: "gone", weight: 4 }),
    ).toBe(start);
  });
});

describe("removeFromMix", () => {
  // Fails if the wrong entry goes, the others lose their weights or order,
  // or the input changes.
  it("removes one entry, and the others keep their weights and order", () => {
    const start = recordWithMix([
      { workflowId: "a", weight: 1 },
      { workflowId: "b", weight: 2 },
      { workflowId: "c", weight: 3 },
    ]);
    const before = copyOf(start);

    const next = removeFromMix(start, {
      workloadId: "steady",
      workflowId: "b",
    });

    expect(mixOf(next)).toEqual([
      { workflowId: "a", weight: 1 },
      { workflowId: "c", weight: 3 },
    ]);
    expect(start).toEqual(before);
  });

  // Fails if removing the last entry is refused, or leaves anything but an
  // empty mix.
  it("leaves an empty mix when the last entry goes", () => {
    const start = recordWithMix([{ workflowId: "a", weight: 1 }]);

    const next = removeFromMix(start, {
      workloadId: "steady",
      workflowId: "a",
    });

    expect(mixOf(next)).toEqual([]);
  });

  // Fails if an entry that isn't there, or a workload that isn't there,
  // returns a new record.
  it("returns the same record for no such entry or no such workload", () => {
    const start = recordWithMix([{ workflowId: "a", weight: 1 }]);

    expect(
      removeFromMix(start, { workloadId: "steady", workflowId: "b" }),
    ).toBe(start);
    expect(removeFromMix(start, { workloadId: "gone", workflowId: "a" })).toBe(
      start,
    );
  });

  // Fails if a re-add is taken for an undo: the entry comes back last at
  // weight 1, not at its old place and weight. Only Undo restores those,
  // because the history keeps the record from before.
  it("is not undone by adding the workflow back", () => {
    const start = recordWithMix([
      { workflowId: "a", weight: 80 },
      { workflowId: "b", weight: 20 },
    ]);

    const removed = removeFromMix(start, {
      workloadId: "steady",
      workflowId: "a",
    });
    const readded = addToMix(removed, {
      workloadId: "steady",
      workflowId: "a",
    });

    expect(mixOf(readded)).toEqual([
      { workflowId: "b", weight: 20 },
      { workflowId: "a", weight: 1 },
    ]);
  });
});

describe("the shares after each command", () => {
  // Fails if the shares shown after adding, re-weighting, or removing don't
  // add to exactly 100.0% (1,000 tenths).
  it("add to exactly 100.0% after adding, re-weighting, and removing", () => {
    const start = recordWithMix([]);
    const added = ["a", "b", "c"].reduce(
      (record, workflowId) =>
        addToMix(record, { workloadId: "steady", workflowId }),
      start,
    );
    const weighted = setMixWeight(added, {
      workloadId: "steady",
      workflowId: "a",
      weight: 80,
    });
    const removed = removeFromMix(weighted, {
      workloadId: "steady",
      workflowId: "c",
    });

    expect(sharesOf(added).text).toEqual(["33.4%", "33.3%", "33.3%"]);
    for (const record of [added, weighted, removed]) {
      expect(sharesOf(record).tenths).toBe(1000);
    }
    expect(sharesOf(removed).text).toEqual(["98.8%", "1.2%"]);
  });

  // Fails if 80 and 20 stop reading 80.0% and 20.0%.
  it("read 80.0% and 20.0% for weights 80 and 20", () => {
    const record = recordWithMix([
      { workflowId: "a", weight: 80 },
      { workflowId: "b", weight: 20 },
    ]);

    expect(sharesOf(record).text).toEqual(["80.0%", "20.0%"]);
  });
});
