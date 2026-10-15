import { describe, expect, it } from "vitest";
import type { Project, Step } from "../model/project";
import { ComponentRegistryMap } from "./component-registry-map";
import {
  messageQueueDefinition,
  workerPoolDefinition,
} from "./testing/fake-definitions";
import { validateComponents } from "./validate-components";

const registry = new ComponentRegistryMap()
  .register(workerPoolDefinition)
  .register(messageQueueDefinition);

const edge = (from: string, to: string) => ({
  id: `${from}->${to}`,
  from,
  to,
  latencyMs: 1,
  timeoutMs: 1000,
  retry: { maxAttempts: 1, backoff: "none" as const, baseDelayMs: 0 },
});

/** A worker that enqueues to a queue, whose consumer is another worker. */
function project(root: Step, workers = 4): Project {
  const pool = (id: string) => ({
    id,
    type: "test-worker-pool",
    name: id,
    config: { ...workerPoolDefinition.defaultConfig, workers },
  });
  return {
    id: "p",
    name: "p",
    architecture: {
      components: [
        pool("front"),
        {
          id: "q",
          type: "test-message-queue",
          name: "q",
          config: messageQueueDefinition.defaultConfig,
        },
        pool("consumer"),
      ],
      edges: [edge("front", "q"), edge("q", "consumer")],
    },
    workflows: [{ id: "w", name: "w", root }],
    workloads: [],
  };
}

const validRoot: Step = {
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

describe("validateComponents", () => {
  it("accepts a project whose types, configs, and actions all fit", () => {
    expect(validateComponents(project(validRoot), registry)).toEqual([]);
  });

  it("reports unknown types and invalid configs with full paths", () => {
    const p = project(validRoot, 0);
    const withUnknown: Project = {
      ...p,
      architecture: {
        ...p.architecture,
        components: [
          ...p.architecture.components,
          { id: "x", type: "mainframe", name: "x", config: {} },
        ],
      },
    };
    expect(validateComponents(withUnknown, registry)).toEqual([
      {
        path: ["architecture", "components", 0, "config", "workers"],
        message: expect.any(String) as string,
      },
      {
        path: ["architecture", "components", 2, "config", "workers"],
        message: expect.any(String) as string,
      },
      {
        path: ["architecture", "components", 3, "type"],
        message: 'Unknown component type "mainframe".',
      },
    ]);
  });

  it("reports actions the target doesn't accept, including in async steps", () => {
    const root: Step = {
      componentId: "front",
      action: "write",
      calls: [
        {
          componentId: "q",
          action: "read",
          async: { componentId: "consumer", action: "enqueue" },
        },
      ],
    };
    expect(validateComponents(project(root), registry)).toEqual([
      {
        path: ["workflows", 0, "root", "action"],
        message:
          'Test worker pool "front" doesn\'t accept "write"; it accepts "invoke", "read".',
      },
      {
        path: ["workflows", 0, "root", "calls", 0, "action"],
        message:
          'Test message queue "q" doesn\'t accept "read"; it accepts "enqueue".',
      },
      {
        path: ["workflows", 0, "root", "calls", 0, "async", "action"],
        message:
          'Test worker pool "consumer" doesn\'t accept "enqueue"; it accepts "invoke", "read".',
      },
    ]);
  });

  it("reports async work on a component that isn't queue-like", () => {
    const root: Step = {
      componentId: "front",
      action: "invoke",
      async: { componentId: "q", action: "enqueue" },
    };
    expect(validateComponents(project(root), registry)).toEqual([
      {
        path: ["workflows", 0, "root", "async"],
        message:
          'Test worker pool "front" can\'t run async work; only queue-like components can.',
      },
    ]);
  });
});
