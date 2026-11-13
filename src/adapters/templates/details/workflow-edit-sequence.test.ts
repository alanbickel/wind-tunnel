import { describe, expect, it } from "vitest";
import { addCallText } from "../../../application/details/add-call-text";
import { changeStepText } from "../../../application/details/change-step-text";
import {
  addCall,
  changeStep,
  moveStep,
  removeStep,
} from "../../../application/edits/workflow-edits";
import type { ProjectRecord } from "../../../application/ports/project-record";
import {
  awsChangeStep,
  awsNewCall,
} from "../../../application/testing/aws-component-types";
import type { Project } from "../../../domain/model/project";
import { projectA } from "../testing/scenario-runs";
import {
  apply,
  asking,
  beginning,
  connect,
  edgeCount,
  undo,
  type Place,
} from "./edit-sequence";

// The worked example's edit sequence in docs/architecture/workflow-editor.md:
// Template A's "Create order", with a read before its write, edited with the
// step commands and undone, each stage shown as Details outlines it with
// its line in the diagram's text version. Accept an intended change with
// `npx vitest run src/adapters/templates/details --update`, then check the
// guide still matches.

const WORKFLOW_ID = "create-order";

/**
 * Template A with a `read` before "Create order"'s `write`, as the user
 * adds it (UX design §2.5 step 5) once a call can be added.
 */
function withRead(project: Project): Project {
  const workflows = project.workflows.map((workflow) => {
    if (workflow.id !== WORKFLOW_ID) return workflow;
    const fn = workflow.root.calls?.[0];
    if (fn === undefined) throw new Error("Create order calls a function");
    const read = {
      id: "create-order-orders-db-read",
      componentId: "orders-db",
      action: "read",
    } as const;
    const calls = [read, ...(fn.calls ?? [])];
    return {
      ...workflow,
      root: { ...workflow.root, calls: [{ ...fn, calls }] },
    };
  });
  return { ...project, workflows };
}

const START: ProjectRecord = {
  project: withRead(projectA),
  layout: { nodes: {} },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const BEGINNING = beginning(START, WORKFLOW_ID);

/** A call from the root, API Gateway, to orders-db, along the edge just drawn. */
function addedCall(from: Place): Place {
  const start = awsNewCall().execute({
    project: from.record.project,
    workflowId: WORKFLOW_ID,
    stepId: "create-order-api",
  });
  if (start === undefined) throw new Error("The root takes a call");
  const { callId, callerName } = start;
  const { undoName } = addCallText({ callerName, calleeName: "orders-db" });
  return apply({
    from,
    workflowId: WORKFLOW_ID,
    command: (r) =>
      addCall(r, {
        workflowId: WORKFLOW_ID,
        stepId: "create-order-api",
        callId,
        componentId: "orders-db",
        action: "read",
      }),
    description: undoName,
    note: `Edges: ${String(edgeCount(from.record))} (the same: a call adds none)`,
  });
}

/**
 * The call just added, changed from "orders-db · read" to "orders-db ·
 * write": a change adds no edge either.
 */
function changedCall(from: Place): Place {
  const callId = "call-1";
  const start = awsChangeStep().execute({
    project: from.record.project,
    workflowId: WORKFLOW_ID,
    stepId: callId,
  });
  if (start === undefined) throw new Error("The call can be changed");
  const { undoName } = changeStepText({
    fromLabel: start.label,
    toLabel: "orders-db · write",
    stepsBelow: 0,
    toEnqueue: false,
  });
  return apply({
    from,
    workflowId: WORKFLOW_ID,
    command: (r) =>
      changeStep(r, {
        workflowId: WORKFLOW_ID,
        stepId: callId,
        componentId: "orders-db",
        action: "write",
      }),
    description: undoName,
    note: `Edges: ${String(edgeCount(from.record))} (the same: a change adds none)`,
  });
}

describe("the workflow editor's edit sequence", () => {
  // Fails if a move, a remove, an add, a change, or an undo of any changes what the
  // outline and the text version show, so the guide's example no longer
  // matches what the commands do; if a move, a remove, a call, or a change
  // takes or adds an edge; if connecting adds none, or an undo leaves the edge
  // or the call behind (it must give back the very record from before).
  it("moves, removes, adds, and changes steps and undoes each, on Template A's Create order", async () => {
    const write = "create-order-orders-db";
    const moved = apply({
      from: BEGINNING,
      workflowId: WORKFLOW_ID,
      command: (r) =>
        moveStep(r, {
          workflowId: WORKFLOW_ID,
          stepId: write,
          direction: "up",
        }),
      description: "Move orders-db · write up",
    });
    const removed = apply({
      from: moved,
      workflowId: WORKFLOW_ID,
      command: (r) => removeStep(r, { workflowId: WORKFLOW_ID, stepId: write }),
      description: "Remove orders-db · write",
      asks: asking(moved.record, { workflowId: WORKFLOW_ID, stepId: write }),
    });
    const undone = undo(removed, WORKFLOW_ID);
    const fn = "create-order-fn-orders";
    const removedWithCalls = apply({
      from: undone,
      workflowId: WORKFLOW_ID,
      command: (r) => removeStep(r, { workflowId: WORKFLOW_ID, stepId: fn }),
      description: "Remove fn-orders · invoke",
      asks: asking(undone.record, { workflowId: WORKFLOW_ID, stepId: fn }),
    });
    const undoneAgain = undo(removedWithCalls, WORKFLOW_ID);
    const edge = connect({
      from: undoneAgain,
      workflowId: WORKFLOW_ID,
      fromId: "api",
      toId: "orders-db",
    });
    const calls = addedCall(edge);
    const changed = changedCall(calls);
    const undoneChange = undo(changed, WORKFLOW_ID);
    const undoneCall = undo(undoneChange, WORKFLOW_ID);
    const undoneEdge = undo(undoneCall, WORKFLOW_ID);
    const places = [
      BEGINNING,
      moved,
      removed,
      undone,
      removedWithCalls,
      undoneAgain,
      edge,
      calls,
      changed,
      undoneChange,
      undoneCall,
      undoneEdge,
    ];

    const text = `${places.flatMap((place) => place.lines).join("\n")}\n`;

    await expect(text).toMatchFileSnapshot("workflow-edit-sequence.txt");
    for (const place of places.slice(0, 6)) {
      expect(place.record.project.architecture).toBe(
        START.project.architecture,
      );
    }
    expect(edgeCount(edge.record)).toBe(edgeCount(START) + 1);
    expect(calls.record.project.architecture).toBe(
      edge.record.project.architecture,
    );
    expect(changed.record.project.architecture).toBe(
      calls.record.project.architecture,
    );
    expect(undoneChange.record).toBe(calls.record);
    expect(undoneCall.record).toBe(edge.record);
    expect(undoneEdge.record).toBe(undoneAgain.record);
    expect(undoneAgain.record).toBe(undone.record);
    expect(undone.record).toBe(moved.record);
  });
});
