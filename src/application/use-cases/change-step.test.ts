import { describe, expect, it } from "vitest";
import type { Project } from "../../domain/model/project";
import { awsChangeStep } from "../testing/aws-component-types";
import { sampleRecord } from "../testing/sample-record";

// The sample's "Read item": api-invoke > fn-invoke > table-read.
const base = { workflowId: "read", project: sampleRecord.project };

/** The sample with a queue's async work: enq (enqueue) on a table, then a consumer. */
const withAsync: Project = {
  ...sampleRecord.project,
  workflows: [
    {
      id: "async",
      name: "Async",
      root: {
        id: "root",
        componentId: "api",
        action: "invoke",
        calls: [
          {
            id: "enq",
            componentId: "fn",
            action: "invoke",
            async: { id: "consumer", componentId: "table", action: "read" },
          },
        ],
      },
    },
  ],
};

describe("ChangeStep", () => {
  // Fails if the start doesn't say what the step is now, or its label isn't
  // "component · action" (Undo's and the announcement's words), or the
  // caller's name isn't given.
  it("gives the step's component, action, label, and its caller's name", () => {
    const start = awsChangeStep().execute({ ...base, stepId: "table-read" });

    expect(start).toMatchObject({
      componentId: "table",
      action: "read",
      label: "Table · read",
      callerName: "Function",
    });
  });

  // Fails if the root is offered a caller, or isn't offered every component
  // (it has no caller, so no edge to go along).
  it("gives the root no caller and every component", () => {
    const start = awsChangeStep().execute({ ...base, stepId: "api-invoke" });

    expect(start?.callerName).toBeUndefined();
    expect(start?.choices.map((c) => c.componentId)).toEqual([
      "api",
      "fn",
      "table",
    ]);
  });

  // Fails if a component the caller has no edge to is offered, or the
  // caller's neighbour isn't.
  it("offers only the caller's neighbours", () => {
    const start = awsChangeStep().execute({ ...base, stepId: "fn-invoke" });

    expect(start?.choices.map((c) => c.componentId)).toEqual(["fn"]);
  });

  // Fails if a step whose edge has since gone doesn't show its own
  // component (the picker must show what it is now).
  it("adds the step's own component when its edge has gone", () => {
    const { architecture } = sampleRecord.project;
    const project: Project = {
      ...sampleRecord.project,
      architecture: {
        ...architecture,
        edges: architecture.edges.filter((e) => e.to !== "table"),
      },
    };

    const start = awsChangeStep().execute({
      project,
      workflowId: "read",
      stepId: "table-read",
    });

    expect(start?.choices.map((c) => c.componentId)).toEqual(["table"]);
  });

  // Fails if a step with async work still locks its action, or filters the
  // components by its action (the picker offers every neighbour, and a
  // change drops what's under the step), or the count leaves out a nested
  // step, async work, or calls.
  it("offers the neighbours of a step with async work, and counts the steps under a step", () => {
    const start = awsChangeStep().execute({
      project: withAsync,
      workflowId: "async",
      stepId: "enq",
    });

    expect(start).not.toHaveProperty("actionLocked");
    expect(start?.choices.map((c) => c.componentId)).toEqual(["fn"]);
    expect(start?.stepsBelow).toBe(1);
    const root = awsChangeStep().execute({
      project: withAsync,
      workflowId: "async",
      stepId: "root",
    });
    expect(root?.stepsBelow).toBe(2);
    const leaf = awsChangeStep().execute({ ...base, stepId: "table-read" });
    expect(leaf?.stepsBelow).toBe(0);
  });

  // Fails if async work isn't offered a change, with its queue as the
  // caller, or a step that isn't there or a workflow that isn't there is.
  it("offers an async root, whose caller is its queue, and nothing for a missing step or workflow", () => {
    const change = awsChangeStep();

    const root = change.execute({
      project: withAsync,
      workflowId: "async",
      stepId: "consumer",
    });
    expect(root?.callerName).toBe("Function");
    expect(root?.label).toBe("Table · read");
    expect(change.execute({ ...base, stepId: "gone" })).toBeUndefined();
    expect(
      change.execute({ ...base, workflowId: "gone", stepId: "table-read" }),
    ).toBeUndefined();
  });
});
