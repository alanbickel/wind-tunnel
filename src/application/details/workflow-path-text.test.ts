import { describe, expect, it } from "vitest";
import type {
  Component,
  Project,
  Step,
  Workflow,
} from "../../domain/model/project";
import { workflowPathText } from "./workflow-path-text";

/** A component whose name differs from its id, so a shown id is caught. */
function component(id: string): Component {
  return { id, type: "lambda", name: id.replace("-id", ""), config: {} };
}

function step(componentId: string, rest: Partial<Step> = {}): Step {
  return {
    id: `${componentId}-step`,
    componentId,
    action: "invoke",
    ...rest,
  };
}

const project: Project = {
  id: "p",
  name: "p",
  architecture: {
    components: [
      "api-id",
      "fn-orders-id",
      "orders-db-id",
      "orders-queue-id",
      "fn-writer-id",
    ].map(component),
    edges: [],
  },
  workflows: [],
  workloads: [],
};

function workflow(name: string, root: Step): Workflow {
  return { id: name, name, root };
}

describe("workflowPathText", () => {
  // Fails if a step is named by its id or its step id, an action shows
  // anywhere but at the end of the path, or the line loses its full stop.
  it("reads a straight workflow from its first step to its last", () => {
    const getOrder = workflow(
      "Get order",
      step("api-id", {
        calls: [
          step("fn-orders-id", {
            calls: [step("orders-db-id", { action: "read" })],
          }),
        ],
      }),
    );

    expect(workflowPathText(project, getOrder)).toBe(
      "Get order: api → fn-orders → orders-db (read).",
    );
  });

  // Fails if a branching workflow gives only its first or last leaf's path,
  // or the paths lose their order or their semicolons.
  it("gives a branching workflow one path per leaf, in order", () => {
    const createOrder = workflow(
      "Create order",
      step("api-id", {
        calls: [
          step("fn-orders-id", {
            calls: [
              step("orders-db-id", { id: "read", action: "read" }),
              step("orders-db-id", { id: "write", action: "write" }),
            ],
          }),
        ],
      }),
    );

    expect(workflowPathText(project, createOrder)).toBe(
      "Create order: api → fn-orders → orders-db (read); " +
        "api → fn-orders → orders-db (write).",
    );
  });

  // Fails if async work is left out, is joined by an arrow as though the
  // enqueue called it, or the enqueue's action is dropped before "then".
  it("follows async work on from its queue", () => {
    const createOrder = workflow(
      "Create order",
      step("api-id", {
        calls: [
          step("fn-orders-id", {
            calls: [
              step("orders-queue-id", {
                action: "enqueue",
                async: step("fn-writer-id", {
                  calls: [step("orders-db-id", { action: "write" })],
                }),
              }),
            ],
          }),
        ],
      }),
    );

    expect(workflowPathText(project, createOrder)).toBe(
      "Create order: api → fn-orders → orders-queue (enqueue), " +
        "then fn-writer → orders-db (write).",
    );
  });

  // Fails if a step whose component is gone shows the component's id.
  it("names a removed component without its id", () => {
    const orphan = workflow("Orphan", step("gone-id", { action: "read" }));

    expect(workflowPathText(project, orphan)).toBe(
      "Orphan: a removed component (read).",
    );
  });
});
