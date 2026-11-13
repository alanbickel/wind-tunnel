import { describe, expect, it } from "vitest";
import type { Step, Workflow } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";
import { sampleRecord } from "../testing/sample-record";
import { changeStep } from "./workflow-edits";

/** A deep copy, to check later that a command left its input alone. */
function copyOf(record: ProjectRecord): ProjectRecord {
  return JSON.parse(JSON.stringify(record)) as ProjectRecord;
}

const step = (id: string, rest: Partial<Step> = {}): Step => ({
  id,
  componentId: "table",
  action: "read",
  ...rest,
});

// The sample's "Read item" is api > fn > table (read), with edges api → fn
// and fn → table, and the record adds api → table and api → other, so the
// changes below have edges to go along. "With async" has a queue's async
// work, under an enqueue.
const [read] = sampleRecord.project.workflows;
if (read === undefined) throw new Error("The sample has a workflow");
const withAsync: Workflow = {
  id: "async",
  name: "With async",
  root: step("api", {
    componentId: "api",
    action: "invoke",
    calls: [step("enq", { action: "enqueue", async: step("consumer") })],
  }),
};
const { architecture } = sampleRecord.project;
const edgeTemplate = architecture.edges[0];
if (edgeTemplate === undefined) throw new Error("The sample has an edge");
const record: ProjectRecord = {
  ...sampleRecord,
  project: {
    ...sampleRecord.project,
    architecture: {
      ...architecture,
      edges: [
        ...architecture.edges,
        { ...edgeTemplate, id: "api-table", from: "api", to: "table" },
        { ...edgeTemplate, id: "api-other", from: "api", to: "other" },
      ],
    },
    workflows: [read, withAsync],
  },
};

/** A component and an action: what a step is changed to. */
interface ChangeTo {
  readonly componentId: string;
  readonly action: Step["action"];
}

/** `changeStep` of a step in the record. */
function change(
  stepId: string,
  { componentId, action }: ChangeTo,
  workflowId = "read",
): ProjectRecord {
  return changeStep(record, { workflowId, stepId, componentId, action });
}

/** The "async" workflow's records, with calls under the enqueue as well as async work. */
function nestedRecord(): ProjectRecord {
  const enq = step("enq", {
    action: "enqueue",
    calls: [step("call")],
    async: step("consumer", { calls: [step("below")] }),
  });
  const workflow: Workflow = {
    ...withAsync,
    root: { ...withAsync.root, calls: [enq] },
  };
  return {
    ...record,
    project: {
      ...record.project,
      workflows: record.project.workflows.map((w) =>
        w.id === workflow.id ? workflow : w,
      ),
    },
  };
}

/** `enq` of the nested record, changed. */
function changeStepIn(from: ProjectRecord, to: ChangeTo): ProjectRecord {
  return changeStep(from, {
    workflowId: "async",
    stepId: "enq",
    ...to,
  });
}

function rootOf(from: ProjectRecord): Step {
  const root = from.project.workflows[1]?.root;
  if (root === undefined) throw new Error("The record has the async workflow");
  return root;
}

const TABLE_WRITE: ChangeTo = { componentId: "table", action: "write" };

describe("changeStep", () => {
  // Fails if the step loses its id, keeps what's under it (a component's
  // calls mean nothing under another), or any other step, workflow, the
  // layout, or the input record changes.
  it("changes the component and action, keeps the step's id, and drops its calls", () => {
    const before = copyOf(record);

    const next = change("fn-invoke", { componentId: "table", action: "read" });

    const fn = next.project.workflows[0]?.root.calls?.[0];
    expect([fn?.id, fn?.componentId, fn?.action]).toEqual([
      "fn-invoke",
      "table",
      "read",
    ]);
    expect(fn).toEqual({
      id: "fn-invoke",
      componentId: "table",
      action: "read",
    });
    expect(next.project.workflows[1]).toBe(withAsync);
    expect(next.layout).toBe(record.layout);
    expect(record).toEqual(before);
  });

  // Fails if a change to a component the caller has no edge to saves
  // anything (the record is returned as it was, so the edit makes no undo
  // step), or adds an edge; or if a change along an edge that's there
  // builds a new architecture. The caller fn has an edge to table, none to
  // api.
  it("returns the record as it was when the caller has no edge to the new component", () => {
    const along = change("table-read", TABLE_WRITE);
    const missing = change("table-read", {
      componentId: "api",
      action: "invoke",
    });

    expect(along.project.architecture).toBe(record.project.architecture);
    expect(missing).toBe(record);
  });

  // Fails if a step whose edge has gone can't change its action, or a
  // change along the missing edge to the same component adds one (the
  // step's own component adds no dependence). The edge fn → table is
  // removed, and the table's action changes.
  it("changes the action of a step whose edge has gone, and adds no edge", () => {
    const gone: ProjectRecord = {
      ...record,
      project: {
        ...record.project,
        architecture: {
          ...architecture,
          edges: architecture.edges.filter((e) => e.to !== "table"),
        },
      },
    };

    const next = changeStep(gone, {
      workflowId: "read",
      stepId: "table-read",
      componentId: "table",
      action: "write",
    });

    expect(next.project.workflows[0]?.root.calls?.[0]?.calls?.[0]?.action).toBe(
      "write",
    );
    expect(next.project.architecture).toBe(gone.project.architecture);
  });

  // Fails if the root, which has no caller, adds an edge when its
  // component changes, or can't be changed at all.
  it("changes the root and adds no edge for it", () => {
    const next = change("api-invoke", { componentId: "table", action: "read" });

    expect(next.project.workflows[0]?.root).toMatchObject({
      id: "api-invoke",
      componentId: "table",
      action: "read",
    });
    expect(next.project.architecture).toBe(record.project.architecture);
  });

  // Fails if a change of component drops only the calls or only the async
  // work, or only when the type differs (even a change to another component
  // of the same type drops what's under the step), or a change of action
  // alone keeps them.
  it("drops calls and async work on any change of component or action", () => {
    const nested = nestedRecord();
    const toFn = changeStepIn(nested, { componentId: "fn", action: "invoke" });
    const toWrite = changeStepIn(nested, TABLE_WRITE);

    expect(rootOf(toFn).calls?.[0]).toEqual(
      step("enq", { componentId: "fn", action: "invoke" }),
    );
    expect(rootOf(toWrite).calls?.[0]).toEqual(step("enq", TABLE_WRITE));
    const sameType = changeStepIn(nested, {
      componentId: "other",
      action: "enqueue",
    });
    expect(rootOf(sameType).calls?.[0]).toEqual(
      step("enq", { componentId: "other", action: "enqueue" }),
    );
  });

  // Fails if a change to `enqueue` stores more than the component and action
  // (an empty async slot is no `async`), or keeps the async work it had.
  it("stores nothing more than the component and action for a change to enqueue", () => {
    const next = change(
      "enq",
      { componentId: "fn", action: "enqueue" },
      "async",
    );

    expect(next.project.workflows[1]?.root.calls?.[0]).toEqual({
      id: "enq",
      componentId: "fn",
      action: "enqueue",
    });
  });

  // Fails if a step or workflow that isn't there, or a change to what the
  // step already is, returns a new record (the edit would save, and become an
  // undo step, for nothing).
  it("returns the same record for a missing step or workflow, or no change", () => {
    expect(change("gone", TABLE_WRITE)).toBe(record);
    expect(change("fn-invoke", TABLE_WRITE, "gone")).toBe(record);
    expect(change("table-read", { componentId: "table", action: "read" })).toBe(
      record,
    );
  });
});
