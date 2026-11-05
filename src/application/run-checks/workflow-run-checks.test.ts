import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import type { Project, Step } from "../../domain/model/project";
import { removeComponent } from "../edits/component-edits";
import { sampleRecord } from "../testing/sample-record";
import { workflowRunChecks } from "./workflow-run-checks";

const registry = createAwsComponentRegistry();
const checkOf = (project: Project) =>
  workflowRunChecks({ project, registry }).get("read");

const REMOVED =
  "This step calls a component that isn't in the architecture any more.";

/** The sample, with the table's read given async work that calls the function back. */
function withAsyncOnRead(): Project {
  const [read] = sampleRecord.project.workflows;
  if (read === undefined) throw new Error("The sample has a workflow");
  const root: Step = {
    id: "api-invoke",
    componentId: "api",
    action: "invoke",
    calls: [
      {
        id: "fn-invoke",
        componentId: "fn",
        action: "invoke",
        calls: [
          {
            id: "table-read",
            componentId: "table",
            action: "read",
            async: { id: "fn-again", componentId: "fn", action: "invoke" },
          },
        ],
      },
    ],
  };
  return { ...sampleRecord.project, workflows: [{ ...read, root }] };
}

describe("workflowRunChecks", () => {
  // Fails if a sound workflow gets a count, or a step gets an issue.
  it("says nothing about a workflow that can run", () => {
    const check = checkOf(sampleRecord.project);

    expect(check?.problems).toBeUndefined();
    expect(check?.onSteps.size).toBe(0);
  });

  // Fails if a removed component's issue isn't on the step that calls it,
  // or the step after a removed caller gets a second issue that its
  // caller's already explains.
  it("puts a removed component's issue on the step that calls it", () => {
    const withoutTable = removeComponent(sampleRecord, {
      componentId: "table",
    });
    const withoutFn = removeComponent(sampleRecord, { componentId: "fn" });

    const table = checkOf(withoutTable.project);
    const fn = checkOf(withoutFn.project);

    expect(table?.problems).toBe("1 problem");
    expect([...(table?.onSteps ?? [])]).toEqual([["table-read", [REMOVED]]]);
    expect(fn?.problems).toBe("1 problem");
    expect([...(fn?.onSteps ?? [])]).toEqual([["fn-invoke", [REMOVED]]]);
  });

  // Fails if an issue about a step's own async work lands on the async
  // work's first step, or the async step's missing edge lands on the step
  // that holds it (both their paths end in "async"), or the count is one
  // per step instead of one per issue: two of the three issues share a step.
  it("tells a step's async issues from its async work's", () => {
    const check = checkOf(withAsyncOnRead());

    expect(check?.problems).toBe("3 problems");
    expect([...(check?.onSteps ?? [])]).toEqual([
      [
        "table-read",
        [
          "This step gives Table async work to deliver, but only queue-like components can deliver it.",
          'This step gives async work to a "read" step; only "enqueue" steps can have it.',
        ],
      ],
      [
        "fn-again",
        ["This step calls Function from Table, which has no edge to it."],
      ],
    ]);
  });
});
