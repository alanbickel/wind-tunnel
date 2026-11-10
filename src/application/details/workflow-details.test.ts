import { describe, expect, it } from "vitest";
import type { Step, Workflow } from "../../domain/model/project";
import type { OutlineStep } from "./details";
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

  // The queue's outline, with async work: the queue (enq) holds consumer,
  // which has calls c1 (with c1a) and c2.
  const queueWithAsync = (): OutlineStep => {
    const consumer: Step = {
      ...leaf("consumer"),
      calls: [{ ...leaf("c1"), calls: [leaf("c1a")] }, leaf("c2")],
    };
    const workflow: Workflow = {
      ...read,
      root: {
        ...read.root,
        calls: [leaf("a"), { ...leaf("enq"), async: consumer }],
      },
    };
    const { outline } = workflowDetails({
      project: sampleRecord.project,
      workflow,
      onSteps: new Map(),
      currentStepId: undefined,
    });
    const queue = outline.calls[1];
    if (queue === undefined) throw new Error("no queue");
    return queue;
  };

  // Fails if an async root gets Move (it's its slot's only step), loses its
  // Remove, or names anything but its queue as its caller, as the slot it
  // empties, or in its description.
  it("gives an async root Remove and no Move, naming its queue", () => {
    const root = queueWithAsync().async;

    expect(root?.editing).toMatchObject({
      callerStepId: "enq",
      moves: undefined,
      emptiesSlotOf: "Table · read",
    });
    expect(root?.editing?.removal?.question).toContain("the 3 calls under it");
    expect(root?.description).toBe(
      "Runs when a consumer takes the message from Table.",
    );
  });

  // Fails if a step under the async root loses its own caller, or its
  // Move among its siblings.
  it("gives the steps under an async root their own editing", () => {
    const [c1, c2] = queueWithAsync().async?.calls ?? [];
    const editing = (step: OutlineStep | undefined) => step?.editing;

    expect(editing(c1)?.callerStepId).toBe("consumer");
    expect(editing(c1)?.moves).toEqual({ canMoveUp: false, canMoveDown: true });
    expect(editing(c2)?.moves).toEqual({ canMoveUp: true, canMoveDown: false });
  });

  // Fails if a step deeper under the async root loses its caller, or any
  // step but the async root gets the root's description.
  it("describes only the async root", () => {
    const root = queueWithAsync().async;
    const c1 = root?.calls[0];

    expect(c1?.calls[0]?.editing?.callerStepId).toBe("c1");
    expect(c1?.description).toBeUndefined();
  });

  // Fails if an enqueue with no async work gets no slot, one with async work
  // or a step that isn't an enqueue gets one, or an enqueue whose component
  // is gone is offered one (it has no edges to offer).
  it("offers the empty async slot only on an enqueue with none", () => {
    const enqueue: Step = { ...leaf("enq"), action: "enqueue" };
    const outline = (calls: Step[]) =>
      workflowDetails({
        project: sampleRecord.project,
        workflow: { ...read, root: { ...read.root, calls } },
        onSteps: new Map(),
        currentStepId: undefined,
      }).outline.calls.map((c) => c.asyncSlot);

    expect(outline([enqueue, leaf("plain")])).toEqual([
      {
        text: "No async work yet. A message is taken off the queue and nothing runs.",
        addLabel: "Add async work, done when a consumer takes the message",
      },
      undefined,
    ]);
    expect(outline([{ ...enqueue, async: leaf("consumer") }])).toEqual([
      undefined,
    ]);
    expect(outline([{ ...enqueue, componentId: "gone" }])).toEqual([undefined]);
  });
});
