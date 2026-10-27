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
  // Fails if checkComponent reports a known type with a valid config.
  it("accepts a project whose types and configs all fit", () => {
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

  // Fails if checkUniqueNames is skipped, or the message leaves out the
  // type's displayName.
  it("reports a name another component of its type already uses", () => {
    const p = project(validRoot);
    const [front, q, consumer] = p.architecture.components;
    if (front === undefined || q === undefined || consumer === undefined) {
      throw new Error("The project has three components");
    }
    const renamed: Project = {
      ...p,
      architecture: {
        ...p.architecture,
        components: [front, q, { ...consumer, name: "front" }],
      },
    };
    expect(validateComponents(renamed, registry)).toEqual([
      {
        path: ["architecture", "components", 2, "name"],
        message:
          "Another Test worker pool component already uses this name. Please choose another name.",
      },
    ]);
  });

  // Fails if names are checked across the project rather than per type.
  it("accepts components of two types with one name", () => {
    const p = project(validRoot);
    const named: Project = {
      ...p,
      architecture: {
        ...p.architecture,
        components: p.architecture.components.map((c) => ({
          ...c,
          name: c.id === "consumer" ? "consumer" : "orders",
        })),
      },
    };
    expect(validateComponents(named, registry)).toEqual([]);
  });

  // Fails if validateComponents checks steps again: they're run checks now.
  it("leaves the steps' actions to the run checks", () => {
    const root: Step = { componentId: "front", action: "enqueue" };
    expect(validateComponents(project(root), registry)).toEqual([]);
  });
});
