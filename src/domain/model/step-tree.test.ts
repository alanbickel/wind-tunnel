import { describe, expect, it } from "vitest";
import type { Project, Step } from "./project";
import { stepAt, stepLinksOf } from "./step-tree";

const write: Step = { id: "write", componentId: "db", action: "write" };
const enqueue: Step = {
  id: "enqueue",
  componentId: "queue",
  action: "enqueue",
  async: {
    id: "consume",
    componentId: "worker",
    action: "invoke",
    calls: [write],
  },
};
const root: Step = {
  id: "invoke",
  componentId: "fn",
  action: "invoke",
  calls: [{ id: "read", componentId: "db", action: "read" }, enqueue],
};

const project: Project = {
  id: "p",
  name: "p",
  description: "",
  architecture: { components: [], edges: [] },
  workflows: [
    { id: "other", name: "Other", root: write },
    { id: "w", name: "W", root },
  ],
  workloads: [],
};

describe("stepAt", () => {
  // Fails if the walk ignores the workflow's index, a call's index, or
  // async work, or doesn't stop at a step's own field.
  it.each([
    [["workflows", 1, "root"], "invoke"],
    [["workflows", 0, "root"], "write"],
    [["workflows", 1, "root", "calls", 1], "enqueue"],
    [["workflows", 1, "root", "calls", 0, "action"], "read"],
    [["workflows", 1, "root", "calls", 1, "async"], "consume"],
    [["workflows", 1, "root", "calls", 1, "async", "calls", 0], "write"],
    [["workflows", 1, "root", "calls", 1, "async", "componentId"], "consume"],
  ])("finds the step at %o", (path, id) => {
    expect(stepAt(project, path)?.id).toBe(id);
  });

  // Fails if a path that leaves the tree, or isn't into a workflow, names
  // the nearest step instead of none.
  it.each([
    [["workflows", 2, "root"]],
    [["workflows", 1, "root", "calls", 5]],
    [["workloads", 0, "mix"]],
    [["workflows", 1]],
  ])("finds no step at %o", (path) => {
    expect(stepAt(project, path)).toBeUndefined();
  });
});

describe("stepLinksOf", () => {
  // Fails if the walk skips async work, a call's own calls, or a sibling,
  // or gives the root step a caller.
  it("pairs each step with the step that calls it, async work included", () => {
    const links = stepLinksOf({ id: "w", name: "W", root });

    expect(links.map(({ caller, callee }) => [caller.id, callee.id])).toEqual([
      ["invoke", "read"],
      ["invoke", "enqueue"],
      ["enqueue", "consume"],
      ["consume", "write"],
    ]);
  });
});
