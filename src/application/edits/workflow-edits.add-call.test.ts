import { describe, expect, it } from "vitest";
import type { Step, Workflow } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";
import { awsNewCall } from "../testing/aws-component-types";
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
const record: ProjectRecord = {
  ...sampleRecord,
  project: { ...sampleRecord.project, workflows: [read, withAsync] },
};

const API_EDGE = sampleRecord.project.architecture.edges[0];
if (API_EDGE === undefined) throw new Error("The sample has an edge");

/** A component and an action: what a call is to. */
interface CallTo {
  readonly componentId: string;
  readonly action: Step["action"];
}

/** `addCall` from `stepId`, with `NewCall`'s ids and the caller type's defaults. */
function add(
  stepId: string,
  { componentId, action }: CallTo,
  workflowId = "read",
): ProjectRecord {
  const start = awsNewCall().execute({
    project: record.project,
    workflowId,
    stepId,
  });
  if (start === undefined) throw new Error(`no draft for "${stepId}"`);
  const { callId, edgeId, edgeSettings } = start;
  return addCall(record, {
    workflowId,
    stepId,
    callId,
    componentId,
    action,
    edgeId,
    edgeSettings,
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
  // workflow, the layout, or the input record, or adds an edge where the
  // caller already has one (fn has an edge to table).
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
    const underLeaf = add("table-read", TABLE_WRITE);

    expect(callIds(underRoot, [])).toEqual(["fn-invoke", "call-1"]);
    expect(callIds(underLeaf, [0, 0])).toEqual(["call-1"]);
  });

  // Fails if a call along a missing edge adds no edge, adds one with other
  // settings than the caller type's edgeDefaults (API Gateway's: 29,000 ms),
  // adds it between the wrong components, or leaves the call out of the
  // same record.
  it("adds the edge, with the caller type's defaults, when the caller has none to the callee", () => {
    const before = copyOf(record);

    const next = add("api-invoke", TABLE_WRITE);

    const { edges } = next.project.architecture;
    expect(edges).toHaveLength(record.project.architecture.edges.length + 1);
    expect(edges.at(-1)).toEqual({
      id: "call-2",
      from: "api",
      to: "table",
      latencyMs: 1,
      timeoutMs: 29_000,
      retry: { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
    });
    expect(next.project.workflows[0]?.root.calls?.at(-1)?.componentId).toBe(
      "table",
    );
    expect(record).toEqual(before);
  });

  // Fails if a call along an edge that's there adds a second one, or
  // builds a new architecture for nothing.
  it("adds no edge when the caller already has one to the callee", () => {
    const next = add("fn-invoke", TABLE_WRITE);

    expect(next.project.architecture).toBe(record.project.architecture);
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
        componentId: "table",
        action: "write",
        edgeId: "new-edge",
        edgeSettings: API_EDGE,
      });

    expect(call("gone")).toBe(record);
    expect(call("api", "gone")).toBe(record);
    expect(call("api")).not.toBe(record);
  });
});
