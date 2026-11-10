import { describe, expect, it } from "vitest";
import type {
  OutlineStep,
  WorkflowDetails,
} from "../../../application/details/details";
import { addCallText } from "../../../application/details/add-call-text";
import { changeStepText } from "../../../application/details/change-step-text";
import { workflowPathText } from "../../../application/details/workflow-path-text";
import {
  NO_EDITS,
  recordEdit,
  undoEdit,
  type EditHistory,
} from "../../../application/edits/edit-history";
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
import { awsDescribeSelection } from "../../../application/testing/aws-describe-selection";
import type { Project } from "../../../domain/model/project";
import { projectA } from "../testing/scenario-runs";
import { outlineLines } from "./outline-lines";

// The worked example's edit sequence in docs/architecture/workflow-editor.md:
// Template A's "Create order", with a read before its write, edited with the
// step commands and undone, each stage shown as Details outlines it with
// its line in the diagram's text version. Accept an intended change with
// `npx vitest run src/adapters/templates/details --update`, then check the
// guide still matches.

const describeSelection = awsDescribeSelection();
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

/** The workflow as Details describes it, in the record. */
function detailsOf(record: ProjectRecord): WorkflowDetails {
  const details = describeSelection.execute({
    project: record.project,
    selection: { kind: "workflow", workflowId: WORKFLOW_ID },
  });
  if (details?.kind !== "workflow") throw new Error("No Create order");
  return details;
}

/** The step of the outline with the id. */
function stepIn(outline: OutlineStep, stepId: string): OutlineStep {
  if (outline.stepId === stepId) return outline;
  for (const child of outline.calls) {
    try {
      return stepIn(child, stepId);
    } catch {
      // Not under this call: try the next.
    }
  }
  throw new Error(`No step ${stepId}`);
}

/** The record's outline and its text version line. */
function stage(record: ProjectRecord): string[] {
  const { outline } = detailsOf(record);
  const workflow = record.project.workflows.find((w) => w.id === WORKFLOW_ID);
  if (workflow === undefined) throw new Error("No Create order");
  return [
    ...outlineLines(outline, ""),
    `Text version: ${workflowPathText(record.project, workflow)}`,
  ];
}

/** Where the sequence is: the record, and what can be undone. */
interface Place {
  readonly record: ProjectRecord;
  readonly history: EditHistory;
  readonly lines: readonly string[];
}

const BEGINNING: Place = {
  record: START,
  history: NO_EDITS,
  lines: ["Start", ...stage(START)],
};

/** A command's result, and its step in the history. */
interface CommandInput {
  readonly from: Place;
  readonly command: (record: ProjectRecord) => ProjectRecord;
  readonly description: string;
  /** What Remove would ask, as the outline words it, if the command is a remove. */
  readonly asks?: string;
  /** A line after the description, for what the outline doesn't show. */
  readonly note?: string;
}

function apply({
  from,
  command,
  description,
  asks,
  note,
}: CommandInput): Place {
  const record = command(from.record);
  const history = recordEdit(from.history, {
    description,
    before: from.record,
    after: record,
  });
  return {
    record,
    history,
    lines: [
      "",
      ...(asks ? [asks] : []),
      description,
      ...(note ? [note] : []),
      ...stage(record),
    ],
  };
}

function undo(from: Place): Place {
  const move = undoEdit(from.history);
  if (move === undefined) throw new Error("Nothing to undo");
  const description = `Undo: ${move.step.description}`;
  return {
    record: move.to,
    history: move.history,
    lines: [
      "",
      description,
      `Edges: ${String(edgeCount(move.to))}`,
      ...stage(move.to),
    ],
  };
}

/** How many edges the architecture has, which only a call along a missing edge changes. */
function edgeCount(record: ProjectRecord): number {
  return record.project.architecture.edges.length;
}

/** What Remove asks about the step, or that it goes at once. */
function asking(record: ProjectRecord, stepId: string): string {
  const { editing } = stepIn(detailsOf(record).outline, stepId);
  return `Remove asks: ${editing?.removal?.question ?? "nothing; the step goes at once"}`;
}

/**
 * A call from the root, API Gateway, to orders-db: the architecture has no
 * edge between them, so the same command adds one.
 */
function addedCall(from: Place): Place {
  const start = awsNewCall().execute({
    project: from.record.project,
    workflowId: WORKFLOW_ID,
    stepId: "create-order-api",
  });
  if (start === undefined) throw new Error("The root takes a call");
  const { callId, edgeId, edgeSettings, callerName } = start;
  const { undoName } = addCallText({
    callerName,
    calleeName: "orders-db",
    addsEdge: true,
  });
  return apply({
    from,
    command: (r) =>
      addCall(r, {
        workflowId: WORKFLOW_ID,
        stepId: "create-order-api",
        callId,
        componentId: "orders-db",
        action: "read",
        edgeId,
        edgeSettings,
      }),
    description: undoName,
    note: `Edges: ${String(edgeCount(from.record) + 1)} (API Gateway → orders-db is new)`,
  });
}

/**
 * The call just added, changed from "orders-db · read" to "orders-db ·
 * write": the architecture has its edge now, so the command adds none.
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
    edge: undefined,
    stepsBelow: 0,
    toEnqueue: false,
  });
  return apply({
    from,
    command: (r) =>
      changeStep(r, {
        workflowId: WORKFLOW_ID,
        stepId: callId,
        componentId: "orders-db",
        action: "write",
        edgeId: start.edgeId,
        edgeSettings: start.edgeSettings,
      }),
    description: undoName,
    note: `Edges: ${String(edgeCount(from.record))} (the same: API Gateway → orders-db is there already)`,
  });
}

describe("the workflow editor's edit sequence", () => {
  // Fails if a move, a remove, an add, a change, or an undo of any changes what the
  // outline and the text version show, so the guide's example no longer
  // matches what the commands do; if a move or a remove takes an edge; if a
  // call along a missing edge adds none, or its undo leaves the edge or the
  // call behind (it must give back the very record from before).
  it("moves, removes, adds, and changes steps and undoes each, on Template A's Create order", async () => {
    const write = "create-order-orders-db";
    const moved = apply({
      from: BEGINNING,
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
      command: (r) => removeStep(r, { workflowId: WORKFLOW_ID, stepId: write }),
      description: "Remove orders-db · write",
      asks: asking(moved.record, write),
    });
    const undone = undo(removed);
    const fn = "create-order-fn-orders";
    const removedWithCalls = apply({
      from: undone,
      command: (r) => removeStep(r, { workflowId: WORKFLOW_ID, stepId: fn }),
      description: "Remove fn-orders · invoke",
      asks: asking(undone.record, fn),
    });
    const undoneAgain = undo(removedWithCalls);
    const calls = addedCall(undoneAgain);
    const changed = changedCall(calls);
    const undoneChange = undo(changed);
    const undoneCall = undo(undoneChange);
    const places = [
      BEGINNING,
      moved,
      removed,
      undone,
      removedWithCalls,
      undoneAgain,
      calls,
      changed,
      undoneChange,
      undoneCall,
    ];

    const text = `${places.flatMap((place) => place.lines).join("\n")}\n`;

    await expect(text).toMatchFileSnapshot("workflow-edit-sequence.txt");
    for (const place of places.slice(0, 6)) {
      expect(place.record.project.architecture).toBe(
        START.project.architecture,
      );
    }
    expect(edgeCount(calls.record)).toBe(edgeCount(START) + 1);
    expect(changed.record.project.architecture).toBe(
      calls.record.project.architecture,
    );
    expect(undoneChange.record).toBe(calls.record);
    expect(undoneCall.record).toBe(undoneAgain.record);
    expect(undoneAgain.record).toBe(undone.record);
    expect(undone.record).toBe(moved.record);
  });
});
