import { describe, expect, it } from "vitest";
import type {
  Component,
  Edge,
  Project,
  Step,
} from "../../domain/model/project";
import { selectionOnArchitecture } from "./selection-on-architecture";

function component(id: string): Component {
  return { id, type: "lambda", name: id, config: {} };
}

function edge(from: string, to: string): Edge {
  return {
    id: `${from}-${to}`,
    from,
    to,
    latencyMs: 1,
    timeoutMs: 1000,
    retry: { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
  };
}

// Template B's "Create order", with a read that has no edge to it, and a
// component and an edge no step uses.
const createOrder: Step = {
  id: "api-step",
  componentId: "api",
  action: "invoke",
  calls: [
    {
      id: "fn-step",
      componentId: "fn",
      action: "invoke",
      calls: [
        {
          id: "queue-step",
          componentId: "queue",
          action: "enqueue",
          async: {
            id: "writer-step",
            componentId: "writer",
            action: "invoke",
            calls: [{ id: "db-step", componentId: "db", action: "write" }],
          },
        },
        { id: "cache-step", componentId: "cache", action: "read" },
      ],
    },
  ],
};

const project: Project = {
  id: "p",
  name: "p",
  architecture: {
    components: ["api", "fn", "queue", "writer", "db", "cache", "spare"].map(
      component,
    ),
    // fn-db comes before writer-db, so an edge found by its callee alone
    // is the wrong one.
    edges: [
      edge("api", "fn"),
      edge("fn", "queue"),
      edge("fn", "db"),
      edge("queue", "writer"),
      edge("writer", "db"),
    ],
  },
  workflows: [{ id: "create", name: "Create order", root: createOrder }],
  workloads: [],
};

const PATH = {
  componentIds: ["api", "fn", "queue", "writer", "db", "cache"],
  edgeIds: ["api-fn", "fn-queue", "queue-writer", "writer-db"],
};

describe("selectionOnArchitecture", () => {
  // Fails if a finding rings nothing, rings a component other than its
  // key's, or marks a path, or rings a component the project no longer has.
  it("rings a finding's component, if the project has it, and no path", () => {
    const keyAt = (componentId: string) => ({
      kind: "finding" as const,
      key: { kind: "k", componentId, reason: undefined, limitName: undefined },
    });

    expect(selectionOnArchitecture(project, keyAt("db"))).toEqual({
      ringed: { componentIds: ["db"], edgeIds: [] },
      path: { componentIds: [], edgeIds: [] },
    });
    expect(selectionOnArchitecture(project, keyAt("gone")).ringed).toEqual({
      componentIds: [],
      edgeIds: [],
    });
  });

  // Fails if the path leaves out async work or a call's own calls, takes in
  // a component or an edge no step uses (spare, fn-db), or rings anything.
  it("highlights exactly the components and edges a workflow uses", () => {
    const shown = selectionOnArchitecture(project, {
      kind: "workflow",
      workflowId: "create",
    });

    expect(shown).toEqual({
      ringed: { componentIds: [], edgeIds: [] },
      path: PATH,
    });
  });

  // Fails if a step rings its caller's component, or the edge its call
  // arrives on isn't found from the caller's component, as for async work
  // the queue's, or the step loses its workflow's path.
  it.each([
    ["fn-step", "fn", "api-fn"],
    ["writer-step", "writer", "queue-writer"],
    ["db-step", "db", "writer-db"],
  ])(
    "rings step %s's component and the edge it arrives on",
    (stepId, id, edgeId) => {
      const shown = selectionOnArchitecture(project, {
        kind: "step",
        workflowId: "create",
        stepId,
      });

      expect(shown).toEqual({
        ringed: { componentIds: [id], edgeIds: [edgeId] },
        path: PATH,
      });
    },
  );

  // Fails if the root step, which the user calls, rings an edge.
  it("rings only the root step's component", () => {
    const shown = selectionOnArchitecture(project, {
      kind: "step",
      workflowId: "create",
      stepId: "api-step",
    });

    expect(shown.ringed).toEqual({ componentIds: ["api"], edgeIds: [] });
  });

  // Fails if a call with no edge to it rings some other edge out of its
  // caller's component (fn-queue, which the enqueue uses, not this read).
  it("rings no edge for a call that has none", () => {
    const shown = selectionOnArchitecture(project, {
      kind: "step",
      workflowId: "create",
      stepId: "cache-step",
    });

    expect(shown.ringed).toEqual({ componentIds: ["cache"], edgeIds: [] });
  });

  // Fails if a workflow the project doesn't have, or a step its workflow
  // doesn't have, still shows the workflow's path or rings its component.
  it("shows nothing for a workflow or a step the project doesn't have", () => {
    const nothing = {
      ringed: { componentIds: [], edgeIds: [] },
      path: { componentIds: [], edgeIds: [] },
    };

    expect(
      selectionOnArchitecture(project, { kind: "workflow", workflowId: "x" }),
    ).toEqual(nothing);
    expect(
      selectionOnArchitecture(project, {
        kind: "step",
        workflowId: "create",
        stepId: "x",
      }),
    ).toEqual(nothing);
  });

  // Fails if a component's or an edge's selection stops ringing it, or
  // shows a path.
  it("rings a selected component or edge, with no path", () => {
    expect(
      selectionOnArchitecture(project, {
        kind: "component",
        componentId: "db",
      }),
    ).toEqual({
      ringed: { componentIds: ["db"], edgeIds: [] },
      path: { componentIds: [], edgeIds: [] },
    });
    expect(
      selectionOnArchitecture(project, { kind: "edge", edgeId: "fn-db" }),
    ).toEqual({
      ringed: { componentIds: [], edgeIds: ["fn-db"] },
      path: { componentIds: [], edgeIds: [] },
    });
  });
});
