import { describe, expect, it } from "vitest";
import type { Project, Step } from "../../domain/model/project";
import { callNumbersOf } from "./call-numbers";

const edge = (from: string, to: string) => ({
  id: `${from}-${to}`,
  from,
  to,
  latencyMs: 1,
  timeoutMs: 1000,
  retry: { maxAttempts: 1, backoff: "none" as const, baseDelayMs: 0 },
});

// api calls fn; fn calls cache, then queue (which delivers to writer), then
// cache again; writer calls db. So the calls, in order: api-fn 1, fn-cache 2,
// fn-queue 3, queue-writer 4 (async), writer-db 5, fn-cache 6 (the queue's
// async work finishes its tree before fn's next call).
const root: Step = {
  id: "s-api",
  componentId: "api",
  action: "invoke",
  calls: [
    {
      id: "s-fn",
      componentId: "fn",
      action: "invoke",
      calls: [
        { id: "s-cache", componentId: "cache", action: "read" },
        {
          id: "s-queue",
          componentId: "queue",
          action: "enqueue",
          async: {
            id: "s-writer",
            componentId: "writer",
            action: "invoke",
            calls: [{ id: "s-db", componentId: "db", action: "write" }],
          },
        },
        { id: "s-cache-2", componentId: "cache", action: "read" },
      ],
    },
  ],
};

const project: Project = {
  id: "p",
  name: "p",
  architecture: {
    components: ["api", "fn", "cache", "queue", "writer", "db"].map((id) => ({
      id,
      type: "lambda",
      name: id,
      config: {},
    })),
    edges: [
      edge("api", "fn"),
      edge("fn", "cache"),
      edge("fn", "queue"),
      edge("queue", "writer"),
      edge("writer", "db"),
    ],
  },
  workflows: [{ id: "w", name: "w", root }],
  workloads: [],
};

describe("callNumbersOf", () => {
  // Fails if the numbers aren't in the order the requests make the calls
  // (depth first, async work after the step's calls), skip the root, or
  // leave an edge several calls share with one number only.
  it("numbers a workflow's calls in order and lists each of a shared edge's", () => {
    expect(
      callNumbersOf(project, { kind: "workflow", workflowId: "w" }),
    ).toEqual([
      { edgeId: "api-fn", numbers: [1] },
      { edgeId: "fn-cache", numbers: [2, 6] },
      { edgeId: "fn-queue", numbers: [3] },
      { edgeId: "queue-writer", numbers: [4] },
      { edgeId: "writer-db", numbers: [5] },
    ]);
  });

  // Fails if a step's selection loses its workflow's numbers.
  it("keeps the numbers while one of the workflow's steps is selected", () => {
    expect(
      callNumbersOf(project, { kind: "step", workflowId: "w", stepId: "s-db" }),
    ).toEqual(callNumbersOf(project, { kind: "workflow", workflowId: "w" }));
  });

  // Fails if any other selection, or none, or a workflow the project doesn't
  // have, shows numbers.
  it("numbers nothing for any other selection", () => {
    expect(callNumbersOf(project, undefined)).toEqual([]);
    expect(
      callNumbersOf(project, { kind: "component", componentId: "fn" }),
    ).toEqual([]);
    expect(
      callNumbersOf(project, { kind: "workflow", workflowId: "gone" }),
    ).toEqual([]);
  });
});
