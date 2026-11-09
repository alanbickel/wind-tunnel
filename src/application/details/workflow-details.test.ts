import { describe, expect, it } from "vitest";
import type { Step, Workflow } from "../../domain/model/project";
import { sampleRecord } from "../testing/sample-record";
import { usedByLine, workflowDetails } from "./workflow-details";

describe("usedByLine", () => {
  // Fails if a workflow no workload uses gets an empty "Used by:", or the
  // names lose their order or their commas.
  it("names the workloads with commas, or says there are none", () => {
    expect(usedByLine(["Lunch rush", "Steady day"])).toBe(
      "Used by: Lunch rush, Steady day",
    );
    expect(usedByLine([])).toBe("Used by: no workload yet");
  });

  // Fails if names that have commas of their own are joined with commas,
  // so "Lunch rush, 20 s at 2,000 requests/s" reads as two workloads.
  it("joins names that have commas with semicolons", () => {
    expect(usedByLine(["Lunch rush, 20 s", "Steady day"])).toBe(
      "Used by: Lunch rush, 20 s; Steady day",
    );
  });
});

describe("workflowDetails' editing", () => {
  const [read] = sampleRecord.project.workflows;
  if (read === undefined) throw new Error("The sample has a workflow");
  const leaf = (id: string): Step => ({
    id,
    componentId: "table",
    action: "read",
  });
  // api > [a, b(calls: [b1]), c]
  const workflow: Workflow = {
    ...read,
    root: {
      ...read.root,
      calls: [leaf("a"), { ...leaf("b"), calls: [leaf("b1")] }, leaf("c")],
    },
  };
  const { outline } = workflowDetails({
    project: sampleRecord.project,
    workflow,
    onSteps: new Map(),
    currentStepId: undefined,
  });
  const [a, b, c] = outline.calls;

  // Fails if the first of several siblings can move up, or the last can
  // move down, or one in the middle can't move either way.
  it("lets a step move except past either end of its siblings", () => {
    expect(a?.editing?.moves).toEqual({ canMoveUp: false, canMoveDown: true });
    expect(b?.editing?.moves).toEqual({ canMoveUp: true, canMoveDown: true });
    expect(c?.editing?.moves).toEqual({ canMoveUp: true, canMoveDown: false });
  });

  // Fails if a step that has no siblings gets move buttons, a step's caller
  // is named wrongly, the workflow's first step can be edited (its Remove is
  // the workflow's), or a step with calls under it goes without asking.
  it("names the caller, and asks first only about a step with steps under it", () => {
    const only = workflowDetails({
      project: sampleRecord.project,
      workflow: read,
      onSteps: new Map(),
      currentStepId: undefined,
    }).outline;

    expect(outline.editing).toBeUndefined();
    expect(a?.editing).toEqual({
      callerStepId: outline.stepId,
      moves: { canMoveUp: false, canMoveDown: true },
      removal: undefined,
    });
    expect(b?.editing?.removal).toEqual({
      question: "Remove Table · read and the 1 call under it?",
      warning: undefined,
    });
    expect(only.calls[0]?.editing?.moves).toBeUndefined();
  });
});
