import { describe, expect, it } from "vitest";
import { sampleRecord } from "../testing/sample-record";
import { newWorkflowName } from "./new-workflow-name";
import type { Project, Workflow } from "../../domain/model/project";

const { project } = sampleRecord;

function withNames(...names: string[]): Project {
  const [first] = project.workflows;
  if (first === undefined) throw new Error("the sample has a workflow");
  const workflows: Workflow[] = names.map((name, i) => ({
    ...first,
    id: `w-${String(i)}`,
    name,
  }));
  return { ...project, workflows };
}

describe("newWorkflowName", () => {
  // Fails if a blank project's first workflow isn't "workflow-1".
  it("starts at workflow-1", () => {
    expect(newWorkflowName(withNames())).toBe("workflow-1");
  });

  // Fails if it offers a name beside "workflow-1" and "workflow-3" that
  // isn't "workflow-2".
  it("skips names already used", () => {
    expect(newWorkflowName(withNames("workflow-1", "workflow-3"))).toBe(
      "workflow-2",
    );
  });

  // Fails if names are compared exactly: "Workflow-1" would be passed over,
  // and the suggestion would fail `checkWorkflowName` as taken.
  it("compares as the name check does, ignoring case and spaces", () => {
    expect(newWorkflowName(withNames(" Workflow-1 "))).toBe("workflow-2");
  });
});
