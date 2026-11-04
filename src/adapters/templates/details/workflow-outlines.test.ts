import { describe, expect, it } from "vitest";
import type {
  OutlineStep,
  WorkflowDetails,
} from "../../../application/details/details";
import {
  ASYNC_WORK_HEADING,
  usedByLine,
} from "../../../application/details/workflow-details";
import { awsDescribeSelection } from "../../../application/testing/aws-describe-selection";
import type { Project } from "../../../domain/model/project";
import { projectA, projectB } from "../testing/scenario-runs";

// The worked example in docs/architecture/workflow-editor.md: each
// template's workflows as Details outlines them, with "Used by", laid out
// as UX design §2.5 step 3 draws an outline. Accept an intended change with
// `npx vitest run src/adapters/templates/details --update`, then check the
// guide still matches.

const describeSelection = awsDescribeSelection();

/** Each workflow of the project, as Details describes it. */
function workflowsOf(project: Project): WorkflowDetails[] {
  return project.workflows.map(({ id }) => {
    const details = describeSelection.execute({
      project,
      selection: { kind: "workflow", workflowId: id },
    });
    if (details?.kind !== "workflow") throw new Error(`No workflow ${id}`);
    return details;
  });
}

/**
 * The step's line and the lines under it, each step's calls and async work
 * indented to start under its label, as §2.5 draws them.
 */
function outlineLines(step: OutlineStep, indent: string): string[] {
  const under = `${indent}${" ".repeat(step.number.length + 2)}`;
  const asyncLines = step.async
    ? [`${under}${ASYNC_WORK_HEADING}`, ...outlineLines(step.async, under)]
    : [];
  return [
    `${indent}${step.number}  ${step.label}`,
    ...step.calls.flatMap((call) => outlineLines(call, under)),
    ...asyncLines,
  ];
}

/** A template's workflows, one block each: its name, "Used by", its outline. */
function trace(title: string, project: Project): string {
  const blocks = workflowsOf(project).map((workflow) =>
    [
      workflow.name,
      usedByLine(workflow.usedBy),
      ...outlineLines(workflow.outline, ""),
    ].join("\n"),
  );
  return [`${title}: ${project.name}`, ...blocks].join("\n\n");
}

describe("traces", () => {
  // Fails if a template's outline, its numbers, its labels, or its "Used
  // by" change without the guide's trace changing too.
  it("each template's workflows, as Details outlines them", async () => {
    const text = `${trace("Template A", projectA)}\n\n${trace("Template B", projectB)}\n`;

    await expect(text).toMatchFileSnapshot("workflow-outlines.txt");
  });
});
