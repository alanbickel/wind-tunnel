import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "../ports/project-record";
import { sampleRecord } from "../testing/sample-record";
import { addWorkflow, removeWorkflow, renameWorkflow } from "./workflow-edits";

/** A deep copy, to check later that a command left its input alone. */
function copyOf(record: ProjectRecord): ProjectRecord {
  return JSON.parse(JSON.stringify(record)) as ProjectRecord;
}

describe("renameWorkflow", () => {
  // Fails if renameWorkflow changes the id (workloads' mixes would lose
  // it), the steps, anything else in the record, or the input record.
  it("renames a workflow, and nothing else", () => {
    const before = copyOf(sampleRecord);

    const next = renameWorkflow(sampleRecord, {
      workflowId: "read",
      name: "Fetch item",
    });

    expect(next.project.workflows).toEqual([
      { ...sampleRecord.project.workflows[0], name: "Fetch item" },
    ]);
    expect(next.project.architecture).toBe(sampleRecord.project.architecture);
    expect(next.project.workloads).toBe(sampleRecord.project.workloads);
    expect(next.layout).toBe(sampleRecord.layout);
    expect(sampleRecord).toEqual(before);
  });

  // Fails if a rename to the name the workflow has, or of a workflow the
  // project doesn't have, returns a new record: the edit would save, and
  // become an undo step, for nothing.
  it("returns the same record for the same name, or no such workflow", () => {
    expect(
      renameWorkflow(sampleRecord, { workflowId: "read", name: "Read item" }),
    ).toBe(sampleRecord);
    expect(
      renameWorkflow(sampleRecord, { workflowId: "gone", name: "Other" }),
    ).toBe(sampleRecord);
  });
});

describe("removeWorkflow", () => {
  const [read] = sampleRecord.project.workflows;
  const [steady] = sampleRecord.project.workloads;
  if (read === undefined || steady === undefined) {
    throw new Error("The sample has a workflow and a workload");
  }
  const list = { ...read, id: "list", name: "List items" };
  const record: ProjectRecord = {
    ...sampleRecord,
    project: {
      ...sampleRecord.project,
      workflows: [read, list],
      workloads: [
        {
          ...steady,
          mix: [
            { workflowId: "read", weight: 3 },
            { workflowId: "list", weight: 1 },
          ],
        },
        { ...steady, id: "spike", mix: [{ workflowId: "list", weight: 2 }] },
      ],
    },
  };

  // Fails if removeWorkflow leaves the workflow or its mix entries in any
  // workload, drops another workflow's entry or changes its weight, changes
  // anything else in the record, or changes the input record.
  it("takes the workflow and its mix entries from every workload, and nothing else", () => {
    const before = copyOf(record);

    const next = removeWorkflow(record, { workflowId: "list" });

    expect(next.project.workflows).toEqual([read]);
    expect(next.project.workloads.map((w) => w.mix)).toEqual([
      [{ workflowId: "read", weight: 3 }],
      [],
    ]);
    expect(next.project.architecture).toBe(record.project.architecture);
    expect(next.layout).toBe(record.layout);
    expect(record).toEqual(before);
  });

  // Fails if a workflow the project doesn't have returns a new record: the
  // edit would save, and become an undo step, for nothing.
  it("returns the same record for a workflow the project doesn't have", () => {
    expect(removeWorkflow(record, { workflowId: "gone" })).toBe(record);
  });
});

describe("addWorkflow", () => {
  const input = {
    workflowId: "wf-new",
    rootStepId: "step-new",
    name: "Get order",
    componentId: "table",
    action: "read",
  } as const;

  // Fails if addWorkflow drops the given ids, name, or first step, puts
  // the workflow anywhere but last, or changes the rest of the record or
  // the input record.
  it("appends a workflow with the given ids, name, and root step", () => {
    const before = copyOf(sampleRecord);

    const next = addWorkflow(sampleRecord, input);

    expect(next.project.workflows).toEqual([
      ...sampleRecord.project.workflows,
      {
        id: "wf-new",
        name: "Get order",
        root: { id: "step-new", componentId: "table", action: "read" },
      },
    ]);
    expect(next.project.architecture).toBe(sampleRecord.project.architecture);
    expect(next.project.workloads).toBe(sampleRecord.project.workloads);
    expect(next.layout).toBe(sampleRecord.layout);
    expect(sampleRecord).toEqual(before);
  });

  // Fails if the first step gets calls or async work: a new workflow is
  // one step, and #117 adds the rest.
  it("makes a workflow of one step", () => {
    const added = addWorkflow(sampleRecord, input).project.workflows.at(-1);

    expect(Object.keys(added?.root ?? {}).sort()).toEqual([
      "action",
      "componentId",
      "id",
    ]);
  });
});
