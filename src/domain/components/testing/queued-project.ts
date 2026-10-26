import type {
  Component,
  Edge,
  Project,
  Step,
  Workload,
} from "../../model/project";
import {
  messageQueueDefinition,
  workerPoolDefinition,
} from "./fake-definitions";

/** An edge with no delay worth noting, for checks that only read its ends. */
export function plainEdge(from: string, to: string): Edge {
  return {
    id: `${from}->${to}`,
    from,
    to,
    latencyMs: 1,
    timeoutMs: 1000,
    retry: { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
  };
}

/** The "load" workload: both of `queuedProject`'s workflows, at one rate. */
export function loadWorkload(overrides: Partial<Workload> = {}): Workload {
  return {
    id: "load",
    name: "Load",
    durationMs: 10_000,
    seed: 1,
    mix: [
      { workflowId: "create", weight: 1 },
      { workflowId: "get", weight: 1 },
    ],
    profile: [{ atMs: 0, requestsPerSec: 10 }],
    ...overrides,
  };
}

/** Create's call tree: front enqueues on q, whose consumer does the work. */
export const createRoot: Step = {
  componentId: "front",
  action: "invoke",
  calls: [
    {
      componentId: "q",
      action: "enqueue",
      async: { componentId: "consumer", action: "invoke" },
    },
  ],
};

/**
 * A project over the fake registry that passes every check: two worker
 * pools with a queue between them, a "create" workflow through the queue,
 * a "get" workflow that only reads from the front, and a workload of both.
 */
export function queuedProject(): Project {
  return {
    id: "p",
    name: "Queued",
    architecture: {
      components: [pool("front"), queue("q"), pool("consumer")],
      edges: [plainEdge("front", "q"), plainEdge("q", "consumer")],
    },
    workflows: [
      { id: "create", name: "Create", root: createRoot },
      {
        id: "get",
        name: "Get",
        root: { componentId: "front", action: "read" },
      },
    ],
    workloads: [loadWorkload()],
  };
}

function pool(id: string): Component {
  const { type, defaultConfig: config } = workerPoolDefinition;
  return { id, type, name: id, config };
}

function queue(id: string): Component {
  const { type, defaultConfig: config } = messageQueueDefinition;
  return { id, type, name: id, config };
}
