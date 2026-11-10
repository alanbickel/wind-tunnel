import { describe, expect, it } from "vitest";
import type { Step, Workflow } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";
import { awsChangeStep } from "../testing/aws-component-types";
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
// and fn → table. "With async" has a queue's async work, under an enqueue.
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
const record: ProjectRecord = {
  ...sampleRecord,
  project: { ...sampleRecord.project, workflows: [read, withAsync] },
};

/** A component and an action: what a step is changed to. */
interface ChangeTo {
  readonly componentId: string;
  readonly action: Step["action"];
}

/** `changeStep` with `ChangeStep`'s edge id and the caller type's defaults. */
function change(
  stepId: string,
  { componentId, action }: ChangeTo,
  workflowId = "read",
): ProjectRecord {
  const start = awsChangeStep().execute({
    project: record.project,
    workflowId,
    stepId,
  });
  return changeStep(record, {
    workflowId,
    stepId,
    componentId,
    action,
    edgeId: start?.edgeId ?? "no-start",
    edgeSettings: start?.edgeSettings,
  });
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
    edgeId: "e",
    edgeSettings: undefined,
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

  // Fails if a change to a component the caller has no edge to adds no
  // edge, adds it with other settings than the caller type's (API
  // Gateway's timeout is 29,000 ms), or builds a new architecture when
  // there's an edge already.
  it("adds the edge from the caller when it has none to the new component", () => {
    const along = change("table-read", TABLE_WRITE);

    expect(along.project.architecture).toBe(record.project.architecture);
    const viaApi = change("table-read", {
      componentId: "api",
      action: "invoke",
    });
    expect(viaApi.project.architecture.edges.at(-1)).toMatchObject({
      from: "fn",
      to: "api",
      timeoutMs: 5_000,
    });
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

  // Fails if a change along a missing edge adds none, adds one for a step
  // that was under the changed step, or isn't one record (one undo step).
  it("adds the step's own edge and nothing for what was under it", () => {
    const next = change("fn-invoke", { componentId: "table", action: "read" });

    expect(next.project.architecture.edges).toEqual([
      ...record.project.architecture.edges,
      expect.objectContaining({ from: "api", to: "table" }),
    ]);
  });

  // Fails if a step under async work, a step or workflow that isn't there,
  // or a change to what the step already is returns a new record (the edit
  // would save, and become an undo step, for nothing).
  it("returns the same record for async work, a missing step or workflow, or no change", () => {
    expect(change("consumer", TABLE_WRITE, "async")).toBe(record);
    expect(change("gone", TABLE_WRITE)).toBe(record);
    expect(change("fn-invoke", TABLE_WRITE, "gone")).toBe(record);
    expect(change("table-read", { componentId: "table", action: "read" })).toBe(
      record,
    );
  });

  // Fails if a caller with no edge-defaults source (the root, or a caller
  // whose component is gone) adds an edge anyway.
  it("adds no edge when there are no edge settings", () => {
    const next = changeStep(record, {
      workflowId: "read",
      stepId: "table-read",
      componentId: "api",
      action: "invoke",
      edgeId: "e",
      edgeSettings: undefined,
    });

    expect(next.project.architecture).toBe(record.project.architecture);
  });
});
