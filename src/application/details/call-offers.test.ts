import { describe, expect, it } from "vitest";
import type { Edge, Project, Step } from "../../domain/model/project";
import { sampleRecord } from "../testing/sample-record";
import { SAMPLE_QUEUE, SAMPLE_WRITER } from "../testing/sample-queue";
import { callOffersOf } from "./call-offers";

const retry: Edge["retry"] = {
  maxAttempts: 1,
  backoff: "none",
  baseDelayMs: 0,
};
const edge = (id: string, from: string, to: string): Edge => ({
  id,
  from,
  to,
  latencyMs: 1,
  timeoutMs: 1_000,
  retry,
});

const sample = sampleRecord.project;

describe('callOffersOf in the sample (API → Function → Table, and "Read item" uses both edges)', () => {
  // Fails if the offers aren't the edges leaving a box the workflow's steps
  // are on, one per edge, in the architecture's order: the Table has no edge
  // out, so nothing is offered for it.
  it("offers each edge that leaves a box in the path, named for what it does", () => {
    const offers = callOffersOf(sample, {
      kind: "workflow",
      workflowId: "read",
    });

    expect(offers.map((o) => [o.edgeId, o.label, o.targetId])).toEqual([
      ["api-fn", "Add a call from API to Function", "fn"],
      ["fn-table", "Add a call from Function to Table", "table"],
    ]);
  });

  // Fails if an edge the path already uses stops offering (a step can call
  // the same component twice), or the offer names the step it puts the call
  // under by anything but its place and label.
  it("names the step the call goes under, for an edge the path already uses", () => {
    const [first] = callOffersOf(sample, {
      kind: "workflow",
      workflowId: "read",
    });

    expect(first?.steps).toEqual([
      {
        stepId: "api-invoke",
        number: "1",
        label: "API · invoke",
        kind: "call",
      },
    ]);
    expect(first?.stepId).toBe("api-invoke");
  });

  // Fails if anything but a workflow or one of its steps offers a call: a
  // component's, an edge's, or no selection would draw offers on the canvas.
  it.each([
    ["no selection", undefined],
    ["a component", { kind: "component", componentId: "api" } as const],
    ["an edge", { kind: "edge", edgeId: "api-fn" } as const],
    [
      "a workflow the project doesn't have",
      { kind: "workflow", workflowId: "gone" } as const,
    ],
  ])("offers nothing for %s", (_name, selection) => {
    expect(callOffersOf(sample, selection)).toEqual([]);
  });

  // Fails if a selected step stops counting as its workflow's selection, so
  // the offers vanish when the user picks a step in the outline.
  it("offers for a selected step as for its workflow", () => {
    const offers = callOffersOf(sample, {
      kind: "step",
      workflowId: "read",
      stepId: "fn-invoke",
    });

    expect(offers.map((o) => o.edgeId)).toEqual(["api-fn", "fn-table"]);
  });

  // Fails if an edge leaving a box that no step of the workflow is on
  // offers anyway: "Read item" never uses a second workflow's boxes.
  it("offers nothing on an edge from a box that is not in the path", () => {
    const withSpare: Project = {
      ...sample,
      architecture: {
        ...sample.architecture,
        components: [...sample.architecture.components, SAMPLE_WRITER],
        edges: [
          ...sample.architecture.edges,
          edge("writer-table", "writer", "table"),
        ],
      },
    };

    const offers = callOffersOf(withSpare, {
      kind: "workflow",
      workflowId: "read",
    });

    expect(offers.map((o) => o.edgeId)).not.toContain("writer-table");
  });
});

describe("callOffersOf when a box is in the path more than once", () => {
  const twice: Step = {
    id: "api-invoke",
    componentId: "api",
    action: "invoke",
    calls: [
      { id: "fn-1", componentId: "fn", action: "invoke" },
      { id: "fn-2", componentId: "fn", action: "invoke" },
    ],
  };
  const project: Project = {
    ...sample,
    workflows: [{ id: "read", name: "Read item", root: twice }],
  };

  // Fails if the offer picks a step on its own when two could take the call
  // and none is selected (the call would go under the wrong one), or lists
  // fewer than both for the popover to ask about.
  it("asks which step when none is selected", () => {
    const offer = callOffersOf(project, {
      kind: "workflow",
      workflowId: "read",
    }).find((o) => o.edgeId === "fn-table");

    expect(offer?.steps.map((s) => [s.stepId, s.number])).toEqual([
      ["fn-1", "1.1"],
      ["fn-2", "1.2"],
    ]);
    expect(offer?.stepId).toBeUndefined();
  });

  // Fails if a selected step on the edge's box doesn't get the call, or one
  // that isn't on it does.
  it("puts the call under the selected step when it's on the edge's box", () => {
    const offers = callOffersOf(project, {
      kind: "step",
      workflowId: "read",
      stepId: "fn-2",
    });

    expect(offers.find((o) => o.edgeId === "fn-table")?.stepId).toBe("fn-2");
    expect(offers.find((o) => o.edgeId === "api-fn")?.stepId).toBe(
      "api-invoke",
    );
  });
});

describe("callOffersOf for a queue", () => {
  const consumes = (async?: Step): Project => ({
    ...sample,
    architecture: {
      components: [
        ...sample.architecture.components,
        SAMPLE_QUEUE,
        SAMPLE_WRITER,
      ],
      edges: [
        ...sample.architecture.edges,
        edge("fn-queue", "fn", "queue"),
        edge("queue-writer", "queue", "writer"),
      ],
    },
    workflows: [
      {
        id: "orders",
        name: "Orders",
        root: {
          id: "api-invoke",
          componentId: "api",
          action: "invoke",
          calls: [
            {
              id: "fn-invoke",
              componentId: "fn",
              action: "invoke",
              calls: [
                {
                  id: "enq",
                  componentId: "queue",
                  action: "enqueue",
                  ...(async ? { async } : {}),
                },
              ],
            },
          ],
        },
      },
    ],
  });
  const orders = { kind: "workflow", workflowId: "orders" } as const;

  // Fails if an edge leaving a queue with an empty slot doesn't offer the
  // async work (kind "async", worded as async work), or offers a call.
  it("offers async work on an edge from an enqueue whose slot is empty", () => {
    const offer = callOffersOf(consumes(), orders).find(
      (o) => o.edgeId === "queue-writer",
    );

    expect(offer?.label).toBe("Add async work from Queue to Writer");
    expect(offer?.steps.map((s) => [s.stepId, s.kind])).toEqual([
      ["enq", "async"],
    ]);
  });

  // Fails if an edge leaving a queue whose slot is filled still offers
  // anything: the outline offers no call under an enqueue (ADR-0021).
  it("offers nothing on an edge from an enqueue whose slot is filled", () => {
    const filled = consumes({
      id: "writer-step",
      componentId: "writer",
      action: "invoke",
    });

    expect(
      callOffersOf(filled, orders).find((o) => o.edgeId === "queue-writer"),
    ).toBeUndefined();
  });
});
