import { describe, expect, it } from "vitest";
import type { Project } from "../../domain/model/project";
import { sampleRecord } from "../testing/sample-record";
import { checkWorkflowName } from "./workflow-name";

const [read] = sampleRecord.project.workflows;
if (read === undefined) throw new Error("the sample has a workflow");

/** The sample project with a second workflow, "Write item". */
const project: Project = {
  ...sampleRecord.project,
  workflows: [
    ...sampleRecord.project.workflows,
    { ...read, id: "write", name: "Write item" },
  ],
};

/** The "read" workflow's name field, with `text` typed in it. */
function check(text: string) {
  return checkWorkflowName({ project, workflowId: "read", text });
}

describe("checkWorkflowName", () => {
  // Fails if the spaces around the draft stay in the saved name.
  it("drops the spaces around the name", () => {
    expect(check("  Fetch item ")).toEqual({
      status: "passes",
      value: "Fetch item",
    });
  });

  // Fails if an empty name, or one of only spaces, passes.
  it("refuses an empty name", () => {
    const fails = { status: "fails", message: "A workflow needs a name." };
    expect(check("")).toEqual(fails);
    expect(check("   ")).toEqual(fails);
  });

  // Fails if another workflow's name passes, or is compared with its case
  // or the spaces around it.
  it("refuses another workflow's name, in any case", () => {
    const taken = {
      status: "fails",
      message:
        "Another workflow already uses this name. Please choose another name.",
    };
    expect(check("Write item")).toEqual(taken);
    expect(check(" write ITEM ")).toEqual(taken);
  });

  // Fails if the workflow's own name counts against it, so "Read item"
  // couldn't become "read item".
  it("accepts the workflow's own name, in another case", () => {
    expect(check("read item")).toEqual({
      status: "passes",
      value: "read item",
    });
    expect(check("Read item")).toEqual({
      status: "passes",
      value: "Read item",
    });
  });
});
