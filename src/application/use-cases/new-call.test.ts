import { describe, expect, it } from "vitest";
import type { Project } from "../../domain/model/project";
import { awsNewCall } from "../testing/aws-component-types";
import { sampleRecord } from "../testing/sample-record";

// The sample's "Read item": api-invoke > fn-invoke > table-read.
const base = { workflowId: "read", project: sampleRecord.project };

describe("NewCall", () => {
  // Fails if the start has no ids, or the same id for the call and its
  // edge, or the edge defaults aren't the caller type's (API Gateway's
  // timeout is 29,000 ms, Lambda's 5,000).
  it("gives two ids, the caller's name, and the caller type's edge defaults", () => {
    const start = awsNewCall().execute({ ...base, stepId: "api-invoke" });

    expect(start?.callId).toBe("call-1");
    expect(start?.edgeId).toBe("call-2");
    expect(start?.callerName).toBe("API");
    expect(start?.edgeSettings.timeoutMs).toBe(29_000);
    expect(
      awsNewCall().execute({ ...base, stepId: "fn-invoke" })?.edgeSettings
        .timeoutMs,
    ).toBe(5_000);
  });

  // Fails if the caller's own component is offered (the architecture has no
  // edge to itself), a neighbour comes after a component with no edge, or
  // either group loses the project's order.
  it("lists the caller's neighbours first, then the rest, never its own component", () => {
    const start = awsNewCall().execute({ ...base, stepId: "api-invoke" });

    expect(start?.choices.map((c) => [c.componentId, c.addsEdge])).toEqual([
      ["fn", false],
      ["table", true],
    ]);
    const fromFn = awsNewCall().execute({ ...base, stepId: "fn-invoke" });
    expect(fromFn?.choices.map((c) => c.componentId)).toEqual(["table", "api"]);
  });

  // Fails if a neighbour is marked as adding an edge, a component with none
  // isn't, or the note doesn't name the caller.
  it("marks the components with no edge from the caller", () => {
    const start = awsNewCall().execute({ ...base, stepId: "api-invoke" });

    expect(start?.choices[0]?.note).toBeUndefined();
    expect(start?.choices[1]?.note).toBe(
      "No edge from API yet; choosing it adds one.",
    );
  });

  // Fails if a type's actions, or its display name in the label, are lost.
  it("lists each component with its type's actions", () => {
    const start = awsNewCall().execute({ ...base, stepId: "api-invoke" });

    expect(start?.choices.map((c) => [c.label, c.actions])).toEqual([
      ["Function (Lambda)", ["invoke"]],
      ["Table (DynamoDB)", ["read", "write"]],
    ]);
  });

  // Fails if a draft doesn't start for an async root (the queue's consumer
  // can call too), or starts for a step or workflow that isn't there.
  it("starts for async work, and gives nothing for a step or workflow that isn't there", () => {
    const [workflow] = sampleRecord.project.workflows;
    if (workflow === undefined) throw new Error("The sample has a workflow");
    const project: Project = {
      ...sampleRecord.project,
      workflows: [
        {
          ...workflow,
          root: {
            ...workflow.root,
            calls: [
              {
                id: "enq",
                componentId: "table",
                action: "read",
                async: { id: "consumer", componentId: "fn", action: "invoke" },
              },
            ],
          },
        },
      ],
    };

    const start = (stepId: string, workflowId = "read") =>
      awsNewCall().execute({ project, workflowId, stepId });

    expect(start("consumer")?.callerName).toBe("Function");
    expect(start("gone")).toBeUndefined();
    expect(start("api-invoke", "gone")).toBeUndefined();
    expect(start("enq")).toBeDefined();
  });
});
