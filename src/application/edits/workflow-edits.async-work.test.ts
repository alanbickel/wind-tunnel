import { describe, expect, it } from "vitest";
import { lambdaDefinition, sqsDefinition } from "../../domain/components/aws";
import type { Edge, Step, Workflow } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";
import { awsChangeStep, awsNewCall } from "../testing/aws-component-types";
import { sampleRecord } from "../testing/sample-record";
import { findStep, holderOf } from "./step-search";
import {
  addAsyncWork,
  addCall,
  changeStep,
  moveStep,
  removeStep,
} from "./workflow-edits";

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

const retry: Edge["retry"] = {
  maxAttempts: 1,
  backoff: "none",
  baseDelayMs: 0,
};

// The sample (api → fn → table) with an SQS queue and a second function,
// "writer", with edges fn → queue and writer → table but none from the queue
// to the writer. "Orders" is api > fn > queue (enqueue), with the writer's
// async work under the queue, and a call under the writer.
const queueEdge: Edge = {
  id: "fn-queue",
  from: "fn",
  to: "queue",
  latencyMs: 1,
  timeoutMs: 1_000,
  retry,
};
const withQueue: ProjectRecord = {
  ...sampleRecord,
  project: {
    ...sampleRecord.project,
    architecture: {
      components: [
        ...sampleRecord.project.architecture.components,
        {
          id: "queue",
          type: "sqs",
          name: "Queue",
          config: sqsDefinition.defaultConfig,
        },
        {
          id: "writer",
          type: "lambda",
          name: "Writer",
          config: lambdaDefinition.defaultConfig,
        },
      ],
      edges: [...sampleRecord.project.architecture.edges, queueEdge],
    },
  },
};

/** The "orders" workflow, with the queue's async slot as given. */
function ordersWith(queueStep: Partial<Step>): ProjectRecord {
  const workflow: Workflow = {
    id: "orders",
    name: "Orders",
    root: step("api", {
      componentId: "api",
      action: "invoke",
      calls: [
        step("fn", {
          componentId: "fn",
          action: "invoke",
          calls: [
            step("enq", {
              componentId: "queue",
              action: "enqueue",
              ...queueStep,
            }),
          ],
        }),
      ],
    }),
  };
  return {
    ...withQueue,
    project: { ...withQueue.project, workflows: [workflow] },
  };
}

const writerStep = step("writer-step", {
  componentId: "writer",
  action: "invoke",
  calls: [step("write-db", { action: "write" })],
});
const withAsyncWork = ordersWith({ async: writerStep });
const empty = ordersWith({});

function orders(record: ProjectRecord): Workflow {
  const [workflow] = record.project.workflows;
  if (workflow === undefined) throw new Error("no workflow");
  return workflow;
}

/** The queue step, `enq`, of a record's "orders" workflow. */
function queueOf(record: ProjectRecord): Step {
  const queue = findStep(orders(record), "enq");
  if (queue === undefined) throw new Error("no queue step");
  return queue;
}

const WRITER: { componentId: string; action: Step["action"] } = {
  componentId: "writer",
  action: "invoke",
};

/** `addAsyncWork` on `stepId`, with `NewCall`'s ids and the queue type's defaults. */
function addAsync(
  from: ProjectRecord,
  stepId: string,
  workflowId = "orders",
): ProjectRecord {
  const start = awsNewCall().execute({
    project: from.project,
    workflowId,
    stepId,
  });
  if (start === undefined) throw new Error(`no draft for "${stepId}"`);
  return addAsyncWork(from, {
    workflowId,
    stepId,
    asyncId: start.callId,
    ...WRITER,
    edgeId: start.edgeId,
    edgeSettings: start.edgeSettings,
  });
}

describe("the step search", () => {
  // Fails if either helper stops at the main tree and misses async work, or
  // at any depth below it, or finds a step that isn't in the workflow.
  it("finds a step in both trees, at any depth", () => {
    const workflow = orders(withAsyncWork);

    expect(findStep(workflow, "enq")?.id).toBe("enq");
    expect(findStep(workflow, "writer-step")).toBe(writerStep);
    expect(findStep(workflow, "write-db")?.id).toBe("write-db");
    expect(findStep(workflow, "gone")).toBeUndefined();
    expect(holderOf(workflow, "fn")?.id).toBe("api");
    expect(holderOf(workflow, "write-db")?.id).toBe("writer-step");
    expect(holderOf(workflow, "api")).toBeUndefined();
  });

  // Fails if the async root's holder is anything but the queue step that has
  // it: the step the user means by "the queue".
  it("holds the async root by the queue", () => {
    expect(holderOf(orders(withAsyncWork), "writer-step")?.id).toBe("enq");
  });
});

describe("addAsyncWork", () => {
  // Fails if the slot isn't set on the queue step, the step gets another
  // id, component or action, its calls are lost, the edge from the queue to
  // the consumer isn't added with the queue type's defaults in the same
  // record, or the input record changes.
  it("sets the slot and adds the queue's edge when it's missing", () => {
    const before = copyOf(empty);

    const next = addAsync(empty, "enq");

    expect(queueOf(next).async).toEqual({
      id: "call-1",
      componentId: "writer",
      action: "invoke",
    });
    const { edges } = next.project.architecture;
    expect(edges).toHaveLength(empty.project.architecture.edges.length + 1);
    expect(edges.at(-1)).toMatchObject({
      id: "call-2",
      from: "queue",
      to: "writer",
      ...sqsDefinition.edgeDefaults,
    });
    expect(empty).toEqual(before);
  });

  // Fails if an edge that's there is added again, or the architecture is
  // rebuilt for nothing.
  it("adds no edge when the queue already has one to the consumer", () => {
    const edge: Edge = {
      ...queueEdge,
      id: "queue-writer",
      from: "queue",
      to: "writer",
    };
    const there: ProjectRecord = {
      ...empty,
      project: {
        ...empty.project,
        architecture: {
          ...empty.project.architecture,
          edges: [...empty.project.architecture.edges, edge],
        },
      },
    };

    const next = addAsync(there, "enq");

    expect(next.project.architecture).toBe(there.project.architecture);
    expect(queueOf(next).async?.componentId).toBe("writer");
  });

  // Fails if a step with calls loses them, or the slot goes anywhere but
  // `async` (the queue's calls stay as they were).
  it("keeps the queue step's calls", () => {
    const calls = [step("kept")];

    const next = addAsync(ordersWith({ calls }), "enq");

    expect(queueOf(next).calls).toEqual(calls);
  });

  // Fails if it sets async work on a step that isn't an enqueue, replaces
  // async work that's there, or returns a new record for a step or workflow
  // that isn't there (the edit would save, and be an undo step, for nothing).
  it("returns the same record for a step that isn't an enqueue, has async work, or isn't there", () => {
    const call = (from: ProjectRecord, stepId: string, workflowId = "orders") =>
      addAsyncWork(from, {
        workflowId,
        stepId,
        asyncId: "new",
        ...WRITER,
        edgeId: "new-edge",
        edgeSettings: sqsDefinition.edgeDefaults,
      });

    expect(call(empty, "fn")).toBe(empty);
    expect(call(withAsyncWork, "enq")).toBe(withAsyncWork);
    expect(call(empty, "gone")).toBe(empty);
    expect(call(empty, "enq", "gone")).toBe(empty);
    expect(call(empty, "enq")).not.toBe(empty);
  });

  // Fails if a chained queue can't have a slot: an enqueue under async work
  // is an enqueue like any other (ADR-0021 decision 1.4).
  it("works on an enqueue under async work", () => {
    const chained = ordersWith({
      async: step("writer-step", {
        componentId: "writer",
        action: "invoke",
        calls: [step("inner", { componentId: "queue", action: "enqueue" })],
      }),
    });

    const next = addAsync(chained, "inner");

    expect(findStep(orders(next), "inner")?.async?.id).toBe("call-1");
  });
});

describe("the other commands, on the async tree", () => {
  const SAMPLE_WRITE: { componentId: string; action: Step["action"] } = {
    componentId: "table",
    action: "write",
  };

  // Fails if addCall can't reach a step in async work (the record comes back
  // unchanged), or puts the call elsewhere.
  it("addCall adds under the async root", () => {
    const start = awsNewCall().execute({
      project: withAsyncWork.project,
      workflowId: "orders",
      stepId: "writer-step",
    });
    if (start === undefined) throw new Error("no draft");

    const next = addCall(withAsyncWork, {
      workflowId: "orders",
      stepId: "writer-step",
      callId: "added",
      ...SAMPLE_WRITE,
      edgeId: start.edgeId,
      edgeSettings: start.edgeSettings,
    });

    const root = queueOf(next).async;
    expect(root?.calls?.map((c) => c.id)).toEqual(["write-db", "added"]);
  });

  // Fails if changing the async root doesn't add the missing edge from the
  // queue (its caller), or drops what's under it, or leaves the queue's
  // slot holding the old component. The writer's edge to the table is
  // there; the queue's to "fn" is not.
  it("changeStep on the async root adds the edge from the queue", () => {
    const start = awsChangeStep().execute({
      project: withAsyncWork.project,
      workflowId: "orders",
      stepId: "writer-step",
    });
    expect(start?.callerName).toBe("Queue");

    const next = changeStep(withAsyncWork, {
      workflowId: "orders",
      stepId: "writer-step",
      componentId: "fn",
      action: "invoke",
      edgeId: start?.edgeId ?? "none",
      edgeSettings: start?.edgeSettings,
    });

    expect(queueOf(next).async).toEqual({
      id: "writer-step",
      componentId: "fn",
      action: "invoke",
    });
    expect(next.project.architecture.edges.at(-1)).toMatchObject({
      from: "queue",
      to: "fn",
    });
  });

  // Fails if a step below the async root can't move among its siblings, or
  // the move touches the root or anything else.
  it("moveStep moves a step below the root, and does nothing for the root", () => {
    const two = ordersWith({
      async: step("writer-step", {
        componentId: "writer",
        action: "invoke",
        calls: [step("first"), step("second")],
      }),
    });

    const moved = moveStep(two, {
      workflowId: "orders",
      stepId: "second",
      direction: "up",
    });

    expect(queueOf(moved).async?.calls?.map((c) => c.id)).toEqual([
      "second",
      "first",
    ]);
    for (const direction of ["up", "down"] as const) {
      expect(
        moveStep(two, {
          workflowId: "orders",
          stepId: "writer-step",
          direction,
        }),
      ).toBe(two);
    }
  });

  // Fails if removing the async root drops the queue's calls, keeps its
  // async field, takes an edge with it, or touches the input.
  it("removeStep on the root leaves the slot empty, the queue's calls and every edge as they were", () => {
    const calls = [step("kept")];
    const both = ordersWith({ async: writerStep, calls });
    const before = copyOf(both);

    const next = removeStep(both, {
      workflowId: "orders",
      stepId: "writer-step",
    });

    const queue = queueOf(next);
    expect(queue).not.toHaveProperty("async");
    expect(queue.calls).toEqual(calls);
    expect(findStep(orders(next), "write-db")).toBeUndefined();
    expect(next.project.architecture).toBe(both.project.architecture);
    expect(both).toEqual(before);
  });

  // Fails if a step below the root doesn't go with everything under it, or
  // takes the async root with it.
  it("removeStep below the root takes the step and what's under it", () => {
    const next = removeStep(withAsyncWork, {
      workflowId: "orders",
      stepId: "write-db",
    });

    expect(queueOf(next).async?.id).toBe("writer-step");
    expect(queueOf(next).async).not.toHaveProperty("calls");
  });
});
