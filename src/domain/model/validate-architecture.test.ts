import { describe, expect, it } from "vitest";
import type { Edge, Project, Step, Workload } from "./project";
import { validateArchitecture } from "./validate-architecture";

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
    durationMs: 60_000,
    seed: 42,
    mix: [
      { workflowId: "get-order", weight: 80 },
      { workflowId: "create-order", weight: 20 },
    ],
    profile: [
      { atMs: 0, requestsPerSec: 200 },
      { atMs: 20_000, requestsPerSec: 2000 },
    ],
    ...overrides,
  };
}

/** Messages only, for readable assertions. */
const messages = (project: Project) =>
  validateArchitecture(project).map((issue) => issue.message);

describe("validateArchitecture", () => {
  // Fails if a check reports an issue in a sound architecture.
  it("accepts a valid project", () => {
    expect(validateArchitecture(validProject())).toEqual([]);
  });

  describe("unique IDs", () => {
    // Fails if checkUniqueIds skips components, or reports the first of a pair.
    it("rejects duplicate component IDs", () => {
      const p = validProject();
      const project = {
        ...p,
        architecture: {
          ...p.architecture,
          components: [...p.architecture.components, component("api", "x")],
        },
      };
      expect(validateArchitecture(project)).toEqual([
        {
          path: ["architecture", "components", 6, "id"],
          message: 'Duplicate component ID "api".',
        },
      ]);
    });

    // Fails if checkAllUniqueIds leaves out workflows or workloads.
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

    // Fails if checkEndpoints stops checking an edge's ends exist.
    it("rejects edges to unknown components", () => {
      expect(messages(withEdges([edge("api", "ghost")]))).toEqual([
        'Edge "api->ghost" refers to unknown component "ghost".',
      ]);
    });

    // Fails if checkEndpoints lets an edge loop back to its own component.
    it("rejects an edge from a component to itself", () => {
      expect(messages(withEdges([edge("api", "api")]))).toEqual([
        'Edge "api->api" connects "api" to itself.',
      ]);
    });

    // Fails if checkNotDuplicate is skipped.
    it("rejects two edges between the same pair", () => {
      const duplicate = { ...edge("api", "fn-api"), id: "second" };
      expect(messages(withEdges([duplicate]))).toEqual([
        'Edge "second" duplicates another edge from "api" to "fn-api".',
      ]);
    });

    // Fails if checkSettings is skipped: a save would store an edge whose
    // timeout the document schema refuses, so the project wouldn't open.
    it("rejects an edge whose settings are out of range, at the setting", () => {
      const bad = {
        ...edge("api", "orders-db"),
        timeoutMs: 0,
        retry: { maxAttempts: 11, backoff: "none", baseDelayMs: 0 },
      } satisfies Edge;
      const issues = validateArchitecture(withEdges([bad]));
      expect(issues.map((issue) => issue.path)).toEqual([
        ["architecture", "edges", 5, "timeoutMs"],
        ["architecture", "edges", 5, "retry", "maxAttempts"],
      ]);
      expect(issues[0]?.message).toMatch(/^Edge "api->orders-db": /);
    });
  });

  // Fails if validateArchitecture stops at the first issue it finds.
  it("reports every problem, not just the first", () => {
    const p = validProject();
    const project: Project = {
      ...p,
      architecture: {
        ...p.architecture,
        edges: [
          ...p.architecture.edges,
          edge("api", "ghost"),
          edge("api", "api"),
        ],
      },
      workloads: [workload(), workload()],
    };
    expect(validateArchitecture(project)).toHaveLength(3);
  });

  // Fails if a run rule (here, a step's missing component and an empty
  // mix) is checked with the architecture again.
  it("leaves workflows and workloads to the run checks", () => {
    const p = validProject();
    const project: Project = {
      ...p,
      workflows: [{ id: "w", name: "w", root: step("ghost") }],
      workloads: [workload({ mix: [] })],
    };
    expect(validateArchitecture(project)).toEqual([]);
  });
});
