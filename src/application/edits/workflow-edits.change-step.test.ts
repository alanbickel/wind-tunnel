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
// and fn → table. "With async" has a queue's async work, read-only.
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

const TABLE_WRITE: ChangeTo = { componentId: "table", action: "write" };

describe("changeStep", () => {
  // Fails if the step loses its id or its calls, or any other step,
  // workflow, the layout, or the input record changes.
  it("changes the component and action and keeps the step's id and calls", () => {
    const before = copyOf(record);

    const next = change("fn-invoke", { componentId: "table", action: "read" });

    const fn = next.project.workflows[0]?.root.calls?.[0];
    expect([fn?.id, fn?.componentId, fn?.action]).toEqual([
      "fn-invoke",
      "table",
      "read",
    ]);
    expect(fn?.calls).toEqual([step("table-read")]);
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

  // Fails if changing a step drops its `async`: the async-work item relies
  // on it surviving (a step keeps its async work when its component or
  // action is changed around it).
  it("keeps a step's async untouched", () => {
    const next = change(
      "enq",
      { componentId: "fn", action: "invoke" },
      "async",
    );

    expect(next).not.toBe(record);
    const enq = next.project.workflows[1]?.root.calls?.[0];
    expect(enq?.async).toEqual(step("consumer"));
    expect(enq?.componentId).toBe("fn");
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
