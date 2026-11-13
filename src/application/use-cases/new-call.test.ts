import { describe, expect, it } from "vitest";
import type { Project } from "../../domain/model/project";
import { awsNewCall } from "../testing/aws-component-types";
import { sampleRecord } from "../testing/sample-record";

// The sample's "Read item": api-invoke > fn-invoke > table-read.
const base = { workflowId: "read", project: sampleRecord.project };

describe("NewCall", () => {
  // Fails if the start has no id, or doesn't name the caller.
  it("gives the call's id and the caller's name", () => {
    const start = awsNewCall().execute({ ...base, stepId: "api-invoke" });

    expect(start?.callId).toBe("call-1");
    expect(start?.callerName).toBe("API");
  });

  // Fails if a component with no edge from the caller is offered (a call
  // never adds an edge), or a neighbour is missing.
  it("offers only the components the caller has an edge to", () => {
    const fromApi = awsNewCall().execute({ ...base, stepId: "api-invoke" });
    const fromFn = awsNewCall().execute({ ...base, stepId: "fn-invoke" });

    expect(fromApi?.choices.map((c) => c.componentId)).toEqual(["fn"]);
    expect(fromFn?.choices.map((c) => c.componentId)).toEqual(["table"]);
  });

  // Fails if a caller with no edge out is offered anything, or gets no
  // start (the draft needs it to say so).
  it("offers nothing to a caller with no edge out", () => {
    const start = awsNewCall().execute({ ...base, stepId: "table-read" });

    expect(start?.choices).toEqual([]);
  });

  // Fails if the choices follow the project's component order instead of
  // the edges' order.
  it("lists the neighbours in edge order", () => {
    const { architecture } = sampleRecord.project;
    const [first, second] = architecture.edges;
    if (first === undefined || second === undefined) throw new Error("Edges");
    const project: Project = {
      ...sampleRecord.project,
      architecture: {
        ...architecture,
        edges: [
          { ...first, id: "e1", from: "fn", to: "table" },
          { ...second, id: "e2", from: "fn", to: "api" },
        ],
      },
    };

    const start = awsNewCall().execute({
      project,
      workflowId: "read",
      stepId: "fn-invoke",
    });

    expect(start?.choices.map((c) => c.componentId)).toEqual(["table", "api"]);
  });

  // Fails if a type's actions, or its display name in the label, are lost.
  it("lists each component with its type's actions", () => {
    const start = awsNewCall().execute({ ...base, stepId: "fn-invoke" });

    expect(start?.choices.map((c) => [c.label, c.actions])).toEqual([
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
