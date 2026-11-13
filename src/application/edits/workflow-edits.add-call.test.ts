import { describe, expect, it } from "vitest";
import type { Step, Workflow } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";
import { sampleRecord } from "../testing/sample-record";
import { addCall } from "./workflow-edits";

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

// The sample's "Read item" is api > fn > table (read). "With async" has a
// queue's async work.
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
// The sample's edges are api → fn and fn → table; the record adds table → fn,
// so a leaf can take a call.
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
        { ...edgeTemplate, id: "table-fn", from: "table", to: "fn" },
      ],
    },
    workflows: [read, withAsync],
  },
};

/** A component and an action: what a call is to. */
interface CallTo {
  readonly componentId: string;
  readonly action: Step["action"];
}

/** `addCall` from `stepId`, with the id `call-1`. */
function add(
  stepId: string,
  { componentId, action }: CallTo,
  workflowId = "read",
): ProjectRecord {
  return addCall(record, {
    workflowId,
    stepId,
    callId: "call-1",
    componentId,
    action,
  });
}

/** The ids of the calls of the step reached from "Read item"'s root by these call indexes. */
function callIds(record: ProjectRecord, path: readonly number[]): string[] {
  let at = record.project.workflows[0]?.root;
  for (const index of path) at = at?.calls?.[index];
  return at?.calls?.map((c) => c.id) ?? [];
}

const TABLE_WRITE: CallTo = { componentId: "table", action: "write" };

describe("addCall", () => {
  // Fails if addCall puts the call anywhere but last among the step's
  // calls, gives it another id, component, or action, changes another
  // workflow, the layout, or the input record, or touches the architecture
  // (fn has an edge to table, so the call goes along it).
  it("appends the call under the given step, and leaves the rest as it was", () => {
    const before = copyOf(record);

    const next = add("fn-invoke", TABLE_WRITE);

    const fn = next.project.workflows[0]?.root.calls?.[0];
    expect(fn?.calls?.map((c) => [c.id, c.componentId, c.action])).toEqual([
      ["table-read", "table", "read"],
      ["call-1", "table", "write"],
    ]);
    expect(next.project.workflows[1]).toBe(withAsync);
    expect(next.project.architecture).toBe(record.project.architecture);
    expect(next.layout).toBe(record.layout);
    expect(record).toEqual(before);
  });

  // Fails if the call goes under the wrong step, or at the wrong depth:
  // under the root it's the root's, not the function's.
  it("adds under the root, or under a step with no calls, at their own depth", () => {
    const underRoot = add("api-invoke", {
      componentId: "fn",
      action: "invoke",
    });
    const underLeaf = add("table-read", {
      componentId: "fn",
      action: "invoke",
    });

    expect(callIds(underRoot, [])).toEqual(["fn-invoke", "call-1"]);
    expect(callIds(underLeaf, [0, 0])).toEqual(["call-1"]);
  });

  // Fails if a call along a missing edge adds the edge, or adds the call
  // anyway, or returns a new record (the edit would save, and become an undo
  // step, for nothing). The API has an edge to fn, none to table.
  it("returns the same record when the caller has no edge to the callee", () => {
    const before = copyOf(record);

    const next = add("api-invoke", TABLE_WRITE);

    expect(next).toBe(record);
    expect(record).toEqual(before);
  });

  // Fails if the edge counts in the wrong direction: the API has an edge
  // to fn, but fn has none to the API, so a call from fn to the API has no
  // edge to go along.
  it("takes the edge's direction into account", () => {
    const next = add("fn-invoke", { componentId: "api", action: "invoke" });

    expect(next).toBe(record);
  });

  // Fails if a call goes in for a step or workflow that isn't there, or
  // returns a new record for either (the edit would save, and become an undo
  // step, for nothing).
  it("returns the same record for a step that isn't there, or no such workflow", () => {
    const call = (stepId: string, workflowId = "async") =>
      addCall(record, {
        workflowId,
        stepId,
        callId: "new",
        componentId: "fn",
        action: "invoke",
      });

    expect(call("gone")).toBe(record);
    expect(call("api", "gone")).toBe(record);
    expect(call("api")).not.toBe(record);
  });
});
