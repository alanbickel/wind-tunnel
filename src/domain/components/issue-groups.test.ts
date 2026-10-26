import { describe, expect, it } from "vitest";
import type { Project, Step, Workload } from "../model/project";
import type { RunIssue } from "../model/run-issue";
import { ComponentRegistryMap } from "./component-registry-map";
import { findArchitectureIssues } from "./find-architecture-issues";
import { findRunIssues } from "./find-run-issues";
import {
  messageQueueDefinition,
  workerPoolDefinition,
} from "./testing/fake-definitions";
import {
  createRoot,
  loadWorkload,
  plainEdge,
  queuedProject,
} from "./testing/queued-project";

// Every rule a project was checked against before ADR-0019 is in exactly
// one of the two groups (#94): an architecture issue stops a save and an
// open; a run issue stops only a run. Each row breaks one rule.

const registry = new ComponentRegistryMap()
  .register(workerPoolDefinition)
  .register(messageQueueDefinition);

type Breakage = (project: Project) => Project;

const components =
  (
    change: (
      all: Project["architecture"]["components"],
    ) => Project["architecture"]["components"],
  ): Breakage =>
  (p) => ({
    ...p,
    architecture: {
      ...p.architecture,
      components: change(p.architecture.components),
    },
  });

const addEdge =
  (from: string, to: string, id = `${from}->${to}`): Breakage =>
  (p) => ({
    ...p,
    architecture: {
      ...p.architecture,
      edges: [...p.architecture.edges, { ...plainEdge(from, to), id }],
    },
  });

const withRoot =
  (root: Step): Breakage =>
  (p) => ({
    ...p,
    workflows: [
      { id: "create", name: "Create", root },
      ...p.workflows.slice(1),
    ],
  });

const withWorkload =
  (overrides: Partial<Workload>): Breakage =>
  (p) => ({ ...p, workloads: [loadWorkload(overrides)] });

const ARCHITECTURE_RULES: readonly (readonly [string, Breakage])[] = [
  [
    "a duplicate component ID",
    components((all) => [
      ...all,
      {
        id: "front",
        type: "test-worker-pool",
        name: "other",
        config: { workers: 1 },
      },
    ]),
  ],
  ["a duplicate edge ID", addEdge("consumer", "front", "front->q")],
  [
    "a duplicate workflow ID",
    (p) => ({
      ...p,
      workflows: [
        ...p.workflows,
        {
          id: "get",
          name: "Get again",
          root: { componentId: "front", action: "read" },
        },
      ],
    }),
  ],
  [
    "a duplicate workload ID",
    (p) => ({ ...p, workloads: [loadWorkload(), loadWorkload()] }),
  ],
  ["an edge to a component that isn't there", addEdge("front", "ghost")],
  ["an edge from a component to itself", addEdge("front", "front")],
  ["a second edge between the same pair", addEdge("front", "q", "again")],
  [
    "an unknown component type",
    components((all) =>
      all.map((c) => (c.id === "front" ? { ...c, type: "mainframe" } : c)),
    ),
  ],
  [
    "an invalid config",
    components((all) =>
      all.map((c) => (c.id === "front" ? { ...c, config: { workers: 0 } } : c)),
    ),
  ],
  [
    "a name another component of its type uses",
    components((all) =>
      all.map((c) => (c.id === "consumer" ? { ...c, name: "front" } : c)),
    ),
  ],
];

const RUN_RULES: readonly (readonly [string, RunIssue["kind"], Breakage])[] = [
  [
    "a step on a component that isn't there",
    "unknown-component",
    withRoot({ componentId: "ghost", action: "invoke" }),
  ],
  [
    "a call that doesn't follow an edge",
    "missing-edge",
    withRoot({
      componentId: "front",
      action: "invoke",
      calls: [{ componentId: "consumer", action: "invoke" }],
    }),
  ],
  [
    "async work on a step that isn't enqueue",
    "async-not-on-enqueue",
    withRoot({
      ...createRoot,
      calls: [
        {
          componentId: "q",
          action: "invoke",
          async: { componentId: "consumer", action: "invoke" },
        },
      ],
    }),
  ],
  [
    "an action the component doesn't accept",
    "action-not-accepted",
    withRoot({ componentId: "front", action: "write" }),
  ],
  [
    "async work on a component that isn't queue-like",
    "async-not-delivered",
    withRoot({
      componentId: "front",
      action: "invoke",
      async: { componentId: "q", action: "enqueue" },
    }),
  ],
  ["an empty mix", "empty-mix", withWorkload({ mix: [] })],
  [
    "a mix naming a workflow that isn't there",
    "unknown-workflow",
    withWorkload({ mix: [{ workflowId: "ghost", weight: 1 }] }),
  ],
  [
    "a mix naming a workflow twice",
    "repeated-workflow",
    withWorkload({
      mix: [
        { workflowId: "get", weight: 1 },
        { workflowId: "get", weight: 1 },
      ],
    }),
  ],
  [
    "a mix weight that isn't positive",
    "weight-not-positive",
    withWorkload({ mix: [{ workflowId: "get", weight: 0 }] }),
  ],
  ["an empty profile", "empty-profile", withWorkload({ profile: [] })],
  [
    "profile times that don't increase",
    "profile-time-not-increasing",
    withWorkload({
      profile: [
        { atMs: 0, requestsPerSec: 1 },
        { atMs: 0, requestsPerSec: 1 },
      ],
    }),
  ],
  [
    "a negative rate",
    "negative-rate",
    withWorkload({ profile: [{ atMs: 0, requestsPerSec: -1 }] }),
  ],
];

/** Every run issue in the project, whatever it belongs to. */
function allRunIssues(project: Project): RunIssue[] {
  const { workflows, workloads } = findRunIssues(project, registry);
  return [...workflows.values(), ...workloads.values()].flat();
}

describe("the two groups of checks", () => {
  // Fails if the fixture itself breaks a rule, which would hide the rows'.
  it("finds nothing in the sound project", () => {
    expect(findArchitectureIssues(queuedProject(), registry)).toEqual([]);
    expect(allRunIssues(queuedProject())).toEqual([]);
  });

  // Fails if an architecture rule is dropped, or moved to the run checks.
  it.each(ARCHITECTURE_RULES)("%s is an architecture issue", (_, breakage) => {
    const project = breakage(queuedProject());
    expect(findArchitectureIssues(project, registry)).not.toEqual([]);
    expect(allRunIssues(project)).toEqual([]);
  });

  // Fails if a run rule is dropped, or checked with the architecture.
  it.each(RUN_RULES)("%s is a run issue (%s)", (_, kind, breakage) => {
    const project = breakage(queuedProject());
    expect(findArchitectureIssues(project, registry)).toEqual([]);
    expect(allRunIssues(project).map((issue) => issue.kind)).toContain(kind);
  });
});
