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
  // caller type's edge defaults aren't taken from the caller (Lambda's
  // timeout is 5,000 ms).
  it("gives the step's component, action, label, and its caller's edge defaults", () => {
    const start = awsChangeStep().execute({ ...base, stepId: "table-read" });

    expect(start).toMatchObject({
      componentId: "table",
      action: "read",
      label: "Table · read",
      callerName: "Function",
    });
    expect(start?.edgeSettings?.timeoutMs).toBe(5_000);
  });

  // Fails if the root is offered a caller or an edge, or any component is
  // marked as adding one.
  it("gives the root no caller, no edge settings, and no choice that adds an edge", () => {
    const start = awsChangeStep().execute({ ...base, stepId: "api-invoke" });

    expect(start?.callerName).toBeUndefined();
    expect(start?.edgeSettings).toBeUndefined();
    expect(start?.choices.map((c) => [c.componentId, c.addsEdge])).toEqual([
      ["api", false],
      ["fn", false],
      ["table", false],
    ]);
  });

  // Fails if the caller's neighbours aren't first, or the others aren't
  // marked as adding an edge.
  it("lists the caller's neighbours first, and marks the others as adding an edge", () => {
    const start = awsChangeStep().execute({ ...base, stepId: "fn-invoke" });

    expect(start?.choices.map((c) => [c.componentId, c.addsEdge])).toEqual([
      ["fn", false],
      ["table", true],
    ]);
  });

  // Fails if a step with async work still locks its action, or filters the
  // components by its action (the picker offers every component, and a
  // change drops what's under the step), or the count leaves out a nested
  // step, async work, or calls.
  it("offers every component for a step with async work, and counts the steps under a step", () => {
    const start = awsChangeStep().execute({
      project: withAsync,
      workflowId: "async",
      stepId: "enq",
    });

    expect(start).not.toHaveProperty("actionLocked");
    expect(start?.choices.map((c) => c.componentId)).toEqual(["fn", "table"]);
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
