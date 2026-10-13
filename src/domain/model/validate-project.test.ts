import { describe, expect, it } from "vitest";
import type { Edge, Project, Step, Workload } from "./project";
import { validateProject } from "./validate-project";

const edge = (from: string, to: string): Edge => ({
  id: `${from}->${to}`,
  from,
  to,
  latencyMs: 1,
  timeoutMs: 1000,
  retry: { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
});

const component = (id: string, type: string) => ({
  id,
  type,
  name: id,
  config: {},
});

/** A valid project shaped like Template B: reads to DynamoDB, writes via SQS. */
function validProject(): Project {
  return {
    id: "p1",
    name: "Template B",
    architecture: {
      components: [
        component("api", "api-gateway"),
        component("fn-api", "lambda"),
        component("orders-read", "dynamodb"),
        component("orders-queue", "sqs"),
        component("fn-writer", "lambda"),
        component("orders-db", "rds"),
      ],
      edges: [
        edge("api", "fn-api"),
        edge("fn-api", "orders-read"),
        edge("fn-api", "orders-queue"),
        edge("orders-queue", "fn-writer"),
        edge("fn-writer", "orders-db"),
      ],
    },
    workflows: [
      {
        id: "get-order",
        name: "Get order",
        root: step("api", [
          step("fn-api", [{ componentId: "orders-read", action: "read" }]),
        ]),
      },
      {
        id: "create-order",
        name: "Create order",
        root: step("api", [
          step("fn-api", [
            {
              componentId: "orders-queue",
              action: "enqueue",
              async: step("fn-writer", [
                { componentId: "orders-db", action: "write" },
              ]),
            },
          ]),
        ]),
      },
    ],
    workloads: [workload()],
  };
}

function step(componentId: string, calls: Step[] = []): Step {
  return { componentId, action: "invoke", calls };
}

function workload(overrides: Partial<Workload> = {}): Workload {
  return {
    id: "lunch-rush",
    name: "Lunch rush",
    durationSec: 60,
    seed: 42,
    mix: [
      { workflowId: "get-order", weight: 80 },
      { workflowId: "create-order", weight: 20 },
    ],
    profile: [
      { atSec: 0, requestsPerSec: 200 },
      { atSec: 20, requestsPerSec: 2000 },
    ],
    ...overrides,
  };
}

/** Messages only, for readable assertions. */
const messages = (project: Project) =>
  validateProject(project).map((issue) => issue.message);

describe("validateProject", () => {
  it("accepts a valid project", () => {
    expect(validateProject(validProject())).toEqual([]);
  });

  describe("unique IDs", () => {
    it("rejects duplicate component IDs", () => {
      const p = validProject();
      const project = {
        ...p,
        architecture: {
          ...p.architecture,
          components: [...p.architecture.components, component("api", "x")],
        },
      };
      expect(validateProject(project)).toEqual([
        {
          path: ["architecture", "components", 6, "id"],
          message: 'Duplicate component ID "api".',
        },
      ]);
    });

    it("rejects duplicate workflow and workload IDs", () => {
      const p = validProject();
      const [first] = p.workflows;
      if (first === undefined) throw new Error("fixture has workflows");
      const project = {
        ...p,
        workflows: [...p.workflows, first],
        workloads: [workload(), workload()],
      };
      expect(messages(project)).toEqual([
        'Duplicate workflow ID "get-order".',
        'Duplicate workload ID "lunch-rush".',
      ]);
    });
  });

  describe("edges", () => {
    const withEdges = (edges: Edge[]): Project => {
      const p = validProject();
      return {
        ...p,
        architecture: {
          ...p.architecture,
          edges: [...p.architecture.edges, ...edges],
        },
      };
    };

    it("rejects edges to unknown components", () => {
      expect(messages(withEdges([edge("api", "ghost")]))).toEqual([
        'Edge "api->ghost" refers to unknown component "ghost".',
      ]);
    });

    it("rejects an edge from a component to itself", () => {
      expect(messages(withEdges([edge("api", "api")]))).toEqual([
        'Edge "api->api" connects "api" to itself.',
      ]);
    });

    it("rejects two edges between the same pair", () => {
      const duplicate = { ...edge("api", "fn-api"), id: "second" };
      expect(messages(withEdges([duplicate]))).toEqual([
        'Edge "second" duplicates another edge from "api" to "fn-api".',
      ]);
    });
  });

  describe("workflow steps", () => {
    const withRoot = (root: Step): Project => ({
      ...validProject(),
      workflows: [{ id: "w", name: "w", root }],
      workloads: [workload({ mix: [{ workflowId: "w", weight: 1 }] })],
    });

    it("rejects steps on unknown components", () => {
      expect(validateProject(withRoot(step("api", [step("ghost")])))).toEqual([
        {
          path: ["workflows", 0, "root", "calls", 0, "componentId"],
          message: 'Step refers to unknown component "ghost".',
        },
      ]);
    });

    it("rejects a call that doesn't follow an edge", () => {
      // api -> orders-db skips fn-api; there's no edge for it.
      expect(
        validateProject(withRoot(step("api", [step("orders-db")]))),
      ).toEqual([
        {
          path: ["workflows", 0, "root", "calls", 0],
          message:
            'No edge from "api" to "orders-db"; every call must follow an edge.',
        },
      ]);
    });

    it("checks edge direction", () => {
      // The edge is api -> fn-api, not the other way round.
      expect(messages(withRoot(step("fn-api", [step("api")])))).toEqual([
        'No edge from "fn-api" to "api"; every call must follow an edge.',
      ]);
    });

    it("requires async work to follow an edge from the queue", () => {
      const root = step("fn-api", [
        {
          componentId: "orders-queue",
          action: "enqueue",
          async: step("orders-db"), // no queue -> orders-db edge
        },
      ]);
      expect(messages(withRoot(root))).toEqual([
        'No edge from "orders-queue" to "orders-db"; every call must follow an edge.',
      ]);
    });

    it("allows async work only on enqueue steps", () => {
      const root: Step = {
        componentId: "orders-queue",
        action: "invoke",
        async: step("fn-writer"),
      };
      expect(messages(withRoot(root))).toEqual([
        'Only "enqueue" steps can have async work; this step is "invoke".',
      ]);
    });

    it("finds problems at any depth", () => {
      const root = step("api", [
        step("fn-api", [
          { componentId: "orders-read", action: "read" },
          { componentId: "orders-db", action: "write" }, // no fn-api -> orders-db
        ]),
      ]);
      expect(validateProject(withRoot(root)).map((i) => i.path)).toEqual([
        ["workflows", 0, "root", "calls", 0, "calls", 1],
      ]);
    });
  });

  describe("workloads", () => {
    const withWorkload = (overrides: Partial<Workload>): Project => ({
      ...validProject(),
      workloads: [workload(overrides)],
    });

    it("rejects an empty mix", () => {
      expect(messages(withWorkload({ mix: [] }))).toEqual([
        "The mix needs at least one workflow.",
      ]);
    });

    it("rejects unknown and repeated workflows in the mix", () => {
      const mix = [
        { workflowId: "get-order", weight: 1 },
        { workflowId: "get-order", weight: 1 },
        { workflowId: "ghost", weight: 1 },
      ];
      expect(messages(withWorkload({ mix }))).toEqual([
        'Workflow "get-order" appears in the mix more than once.',
        'Mix refers to unknown workflow "ghost".',
      ]);
    });

    it("rejects weights that aren't positive", () => {
      const mix = [
        { workflowId: "get-order", weight: 0 },
        { workflowId: "create-order", weight: -1 },
      ];
      expect(messages(withWorkload({ mix }))).toEqual([
        "Mix weights must be positive.",
        "Mix weights must be positive.",
      ]);
    });

    it("rejects an empty profile", () => {
      expect(messages(withWorkload({ profile: [] }))).toEqual([
        "The profile needs at least one point.",
      ]);
    });

    it("rejects profile times that don't increase", () => {
      const profile = [
        { atSec: 0, requestsPerSec: 1 },
        { atSec: 10, requestsPerSec: 1 },
        { atSec: 10, requestsPerSec: 1 },
        { atSec: 5, requestsPerSec: 1 },
      ];
      expect(messages(withWorkload({ profile }))).toEqual([
        "Profile times must increase; 10 s comes after 10 s.",
        "Profile times must increase; 5 s comes after 10 s.",
      ]);
    });

    it("rejects negative rates", () => {
      const profile = [{ atSec: 0, requestsPerSec: -5 }];
      expect(messages(withWorkload({ profile }))).toEqual([
        "Request rates can't be negative.",
      ]);
    });
  });

  it("reports every problem, not just the first", () => {
    const p = validProject();
    const project: Project = {
      ...p,
      architecture: {
        ...p.architecture,
        edges: [...p.architecture.edges, edge("api", "ghost")],
      },
      workloads: [workload({ mix: [], profile: [] })],
    };
    expect(validateProject(project)).toHaveLength(3);
  });
});
