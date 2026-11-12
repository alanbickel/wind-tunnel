import { describe, expect, it } from "vitest";
import type { Project, Workload } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";
import { sampleRecord } from "../testing/sample-record";
import { addWorkload, removeWorkload, renameWorkload } from "./workload-edits";

/** A deep copy, to check later that a command left its input alone. */
function copyOf(record: ProjectRecord): ProjectRecord {
  return JSON.parse(JSON.stringify(record)) as ProjectRecord;
}

const [sampleWorkload] = sampleRecord.project.workloads;
if (sampleWorkload === undefined) throw new Error("The sample has a workload");
const steady: Workload = sampleWorkload;

/** The sample with workloads named as given, in order. */
function recordWith(...names: string[]): ProjectRecord {
  const workloads = names.map((name, index): Workload => ({
    ...steady,
    id: `w${String(index)}`,
    name,
  }));
  const project: Project = { ...sampleRecord.project, workloads };
  return { ...sampleRecord, project };
}

/** The names of the workloads once `addWorkload` has added one. */
function namesAfterAdd(record: ProjectRecord): string[] {
  const next = addWorkload(record, { workloadId: "new" });
  return next.project.workloads.map((w) => w.name);
}

describe("addWorkload", () => {
  // Fails if the new workload lacks a default (60 s, seed 42, an empty
  // mix, one point at 0 s and 100 requests/s), ignores the given id, goes
  // anywhere but last, or changes anything else in the record or the input.
  it("appends one workload with the editor's defaults, and nothing else", () => {
    const before = copyOf(sampleRecord);

    const next = addWorkload(sampleRecord, { workloadId: "new" });

    expect(next.project.workloads).toEqual([
      steady,
      {
        id: "new",
        name: "workload-1",
        durationMs: 60_000,
        seed: 42,
        mix: [],
        profile: [{ atMs: 0, requestsPerSec: 100 }],
      },
    ]);
    expect(next.project.workflows).toBe(sampleRecord.project.workflows);
    expect(next.project.architecture).toBe(sampleRecord.project.architecture);
    expect(next.layout).toBe(sampleRecord.layout);
    expect(sampleRecord).toEqual(before);
  });

  // Fails if the name is "workload-N" for the count, not the first free
  // number: "workload-1" and "workload-2" taken must give "workload-3",
  // and "workload-1" renamed away must come back.
  it("takes the first free name", () => {
    expect(namesAfterAdd(recordWith("workload-1", "workload-2"))).toEqual([
      "workload-1",
      "workload-2",
      "workload-3",
    ]);
    expect(namesAfterAdd(recordWith("Lunch", "workload-2"))).toEqual([
      "Lunch",
      "workload-2",
      "workload-1",
    ]);
  });

  // Fails if the suggestion ignores case, as the name check does: with
  // "Workload-1" taken, "workload-1" would be refused.
  it("takes a name that passes the name check, ignoring case", () => {
    expect(namesAfterAdd(recordWith("Workload-1"))).toEqual([
      "Workload-1",
      "workload-2",
    ]);
  });
});

describe("renameWorkload", () => {
  // Fails if a rename changes the id, the mix, the profile, another
  // workload, anything else in the record, or the input.
  it("sets the name, and nothing else", () => {
    const before = copyOf(sampleRecord);

    const next = renameWorkload(sampleRecord, {
      workloadId: "steady",
      name: "Lunch rush",
    });

    expect(next.project.workloads).toEqual([{ ...steady, name: "Lunch rush" }]);
    expect(next.project.workflows).toBe(sampleRecord.project.workflows);
    expect(next.layout).toBe(sampleRecord.layout);
    expect(sampleRecord).toEqual(before);
  });

  // Fails if a rename to the name the workload has, or of a workload the
  // project doesn't have, returns a new record: it would save, and become
  // an undo step, for nothing.
  it("returns the same record for the same name, or no such workload", () => {
    expect(
      renameWorkload(sampleRecord, { workloadId: "steady", name: "Steady" }),
    ).toBe(sampleRecord);
    expect(
      renameWorkload(sampleRecord, { workloadId: "gone", name: "Other" }),
    ).toBe(sampleRecord);
  });
});

describe("removeWorkload", () => {
  const record = recordWith("A", "B", "C");

  // Fails if a remove takes any workload but the one named, reorders the
  // rest, touches the workflows (a mix names them; they stay), or changes
  // the input.
  it("takes the workload, and nothing else", () => {
    const before = copyOf(record);

    const next = removeWorkload(record, { workloadId: "w1" });

    expect(next.project.workloads.map((w) => w.name)).toEqual(["A", "C"]);
    expect(next.project.workflows).toBe(record.project.workflows);
    expect(next.project.architecture).toBe(record.project.architecture);
    expect(next.layout).toBe(record.layout);
    expect(record).toEqual(before);
  });

  // Fails if a missing workload returns a new record: it would save, and
  // become an undo step, for nothing.
  it("returns the same record for a workload the project doesn't have", () => {
    expect(removeWorkload(record, { workloadId: "gone" })).toBe(record);
  });
});
