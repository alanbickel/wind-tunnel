import { describe, expect, it } from "vitest";
import type { Component, Project } from "../model/project";
import { ComponentRegistry } from "./component-registry";
import { findProjectIssues } from "./find-project-issues";
import { workerPoolDefinition } from "./testing/fake-definitions";

const registry = new ComponentRegistry().register(workerPoolDefinition);

const worker: Component = {
  id: "worker",
  type: "test-worker-pool",
  name: "worker",
  config: workerPoolDefinition.defaultConfig,
};

function project(component: Component, targetId = component.id): Project {
  return {
    id: "p",
    name: "p",
    architecture: { components: [component], edges: [] },
    workflows: [
      { id: "w", name: "w", root: { componentId: targetId, action: "invoke" } },
    ],
    workloads: [],
  };
}

describe("findProjectIssues", () => {
  it("finds nothing in a valid project", () => {
    expect(findProjectIssues(project(worker), registry)).toEqual([]);
  });

  it("reports a component type the registry doesn't know", () => {
    const unknown = { ...worker, type: "mainframe" };
    expect(findProjectIssues(project(unknown), registry)).toMatchObject([
      { path: ["architecture", "components", 0, "type"] },
    ]);
  });

  it("reports only project-wide issues when there are any", () => {
    const unknown = { ...worker, type: "mainframe" };
    const issues = findProjectIssues(project(unknown, "nowhere"), registry);
    expect(issues).toMatchObject([
      { path: ["workflows", 0, "root", "componentId"] },
    ]);
  });
});
