import { describe, expect, it } from "vitest";
import { sampleRecord } from "../testing/sample-record";
import { awsNewWorkflow } from "../testing/aws-component-types";

describe("NewWorkflow", () => {
  // Fails if the start has no ids, or the same id for the workflow and its
  // first step, or a name the project's workflows already use.
  it("gives two ids and the first free name", () => {
    const start = awsNewWorkflow().execute({ project: sampleRecord.project });

    expect(start.workflowId).toBe("wf-1");
    expect(start.rootStepId).toBe("wf-2");
    expect(start.name).toBe("workflow-1");
  });

  // Fails if a component is left out, or listed with another type's
  // actions, or labeled without its type's display name.
  it("lists every component with the actions its type accepts", () => {
    const { components } = awsNewWorkflow().execute({
      project: sampleRecord.project,
    });

    expect(components.map((c) => [c.componentId, c.actions])).toEqual([
      ["api", ["invoke"]],
      ["fn", ["invoke"]],
      ["table", ["read", "write"]],
    ]);
    expect(components[0]?.label).toBe("API (API Gateway)");
  });

  // Fails if a component of a type the registry doesn't know is dropped:
  // it's still a component, so it's still listed, with no action to pick.
  it("lists a component of an unknown type with no actions", () => {
    const [first] = sampleRecord.project.architecture.components;
    if (first === undefined) throw new Error("the sample has a component");
    const { architecture } = sampleRecord.project;
    const project = {
      ...sampleRecord.project,
      architecture: {
        ...architecture,
        components: [{ ...first, type: "mystery" }],
      },
    };

    const { components } = awsNewWorkflow().execute({ project });

    expect(components).toEqual([
      { componentId: "api", label: "API (mystery)", actions: [] },
    ]);
  });
});
