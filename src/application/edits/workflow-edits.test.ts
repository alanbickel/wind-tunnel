import { describe, expect, it } from "vitest";
import type { Step, Workflow } from "../../domain/model/project";
import { stepsOfWorkflow } from "../../domain/model/step-tree";
import type { ProjectRecord } from "../ports/project-record";
import { sampleRecord } from "../testing/sample-record";
import {
  addWorkflow,
  moveStep,
  removeStep,
  removeWorkflow,
  renameWorkflow,
  type StepDirection,
} from "./workflow-edits";

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

describe("moveStep and removeStep", () => {
  const step = (id: string, rest: Partial<Step> = {}): Step => ({
    id,
    componentId: "table",
    action: "read",
    ...rest,
  });
  // api > fn > [read, write, enqueue(calls: [log], async: consumer)]
  const enqueue = step("enq", {
    action: "enqueue",
    calls: [step("log")],
    async: step("consumer", {
      calls: [step("consumer-db"), step("consumer-log")],
    }),
  });
  const fn = step("fn", { calls: [step("read"), step("write"), enqueue] });
  const create: Workflow = {
    id: "create",
    name: "Create order",
    root: step("api", { calls: [fn] }),
  };
  const [read] = sampleRecord.project.workflows;
  if (read === undefined) throw new Error("The sample has a workflow");
  const record: ProjectRecord = {
    ...sampleRecord,
    project: { ...sampleRecord.project, workflows: [read, create] },
  };

  /** The ids of the steps a workflow's `fn` calls, in order. */
  const fnCalls = (r: ProjectRecord): string[] =>
    stepsOfWorkflow(r.project.workflows[1] ?? create)
      .find((s) => s.id === "fn")
      ?.calls?.map((c) => c.id) ?? [];

  // Fails if Move down doesn't swap a step with the sibling after it, Move
  // up with the one before it, loses the step's calls and async work, or
  // changes the input record, another workflow, or the architecture.
  it("swaps a step with its neighbour, its calls and async work with it", () => {
    const before = copyOf(record);

    const down = moveStep(record, {
      workflowId: "create",
      stepId: "write",
      direction: "down",
    });
    const up = moveStep(down, {
      workflowId: "create",
      stepId: "write",
      direction: "up",
    });

    expect(fnCalls(down)).toEqual(["read", "enq", "write"]);
    expect(fnCalls(up)).toEqual(["read", "write", "enq"]);
    expect(
      moveStep(record, {
        workflowId: "create",
        stepId: "enq",
        direction: "up",
      }).project.workflows[1]?.root.calls?.[0]?.calls?.[1],
    ).toEqual(enqueue);
    expect(down.project.workflows[0]).toBe(read);
    expect(down.project.architecture).toBe(record.project.architecture);
    expect(record).toEqual(before);
  });

  // Fails if a move past either end, of a step with no siblings, of the
  // root, of async work or a step under it, or of a step the workflow doesn't have returns a
  // new record: the edit would save, and become an undo step, for nothing.
  it("returns the same record when the step can't move that way", () => {
    const move = (workflowId: string, stepId: string, d: StepDirection) =>
      moveStep(record, { workflowId, stepId, direction: d });

    expect(move("create", "read", "up")).toBe(record);
    expect(move("create", "enq", "down")).toBe(record);
    expect(move("create", "fn", "down")).toBe(record);
    expect(move("create", "api", "down")).toBe(record);
    expect(move("create", "consumer", "up")).toBe(record);
    expect(move("create", "consumer-log", "up")).toBe(record);
    expect(move("create", "gone", "up")).toBe(record);
    expect(move("gone", "read", "down")).toBe(record);
    expect(move("read", "write", "down")).toBe(record);
  });

  // Fails if removeStep leaves the step, or any step under it (calls or
  // async work), takes a sibling or an edge with it, or changes the input
  // record or another workflow.
  it("takes the step and everything under it, async work included, and no edge", () => {
    const before = copyOf(record);

    const next = removeStep(record, { workflowId: "create", stepId: "enq" });

    expect(fnCalls(next)).toEqual(["read", "write"]);
    const ids = stepsOfWorkflow(next.project.workflows[1] ?? create).map(
      (s) => s.id,
    );
    expect(ids).toEqual(["api", "fn", "read", "write"]);
    expect(next.project.architecture).toBe(record.project.architecture);
    expect(next.project.workflows[0]).toBe(read);
    expect(record).toEqual(before);
  });

  // Fails if the last call leaves `calls: []` behind, so a step that has
  // none stores differently from one that never had any.
  it("leaves a step with no calls without a calls field", () => {
    const next = removeStep(
      removeStep(record, { workflowId: "create", stepId: "read" }),
      { workflowId: "create", stepId: "write" },
    );
    const only = removeStep(next, { workflowId: "create", stepId: "enq" });

    expect(only.project.workflows[1]?.root.calls?.[0]).toEqual(step("fn"));
  });

  // Fails if removeStep takes a workflow's root, async work or a step under
  // it, or returns
  // a new record for a step the workflow doesn't have.
  it("returns the same record for the root, async work, a step under it, or no such step", () => {
    const remove = (workflowId: string, stepId: string) =>
      removeStep(record, { workflowId, stepId });

    expect(remove("create", "api")).toBe(record);
    expect(remove("create", "consumer")).toBe(record);
    expect(remove("create", "consumer-db")).toBe(record);
    expect(remove("create", "gone")).toBe(record);
    expect(remove("gone", "read")).toBe(record);
  });
});
