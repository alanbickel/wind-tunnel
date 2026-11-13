import type {
  OutlineStep,
  WorkflowDetails,
} from "../../../application/details/details";
import { workflowPathText } from "../../../application/details/workflow-path-text";
import {
  NO_EDITS,
  recordEdit,
  undoEdit,
  type EditHistory,
} from "../../../application/edits/edit-history";
import type { ProjectRecord } from "../../../application/ports/project-record";
import { awsDescribeSelection } from "../../../application/testing/aws-describe-selection";
import { connectComponents } from "../../../application/edits/edge-edits";
import { SequentialIds } from "../../../application/testing/sequential-ids";
import { NewEdge } from "../../../application/use-cases/new-edge";
import { createAwsComponentRegistry } from "../../../domain/components/aws";
import { outlineLines } from "./outline-lines";

// What the edit sequences in docs/architecture/workflow-editor.md share:
// a record and its history, each stage as Details outlines it with its line
// in the diagram's text version, and the undo that steps back. Each
// sequence is one workflow's, named by `workflowId`.

const describeSelection = awsDescribeSelection();

/** The workflow as Details describes it, in the record. */
export function detailsOf(
  record: ProjectRecord,
  workflowId: string,
): WorkflowDetails {
  const details = describeSelection.execute({
    project: record.project,
    selection: { kind: "workflow", workflowId },
  });
  if (details?.kind !== "workflow") throw new Error(`No ${workflowId}`);
  return details;
}

/** The step of the outline with the id, in its calls or its async work. */
export function stepIn(outline: OutlineStep, stepId: string): OutlineStep {
  const found = findIn(outline, stepId);
  if (found === undefined) throw new Error(`No step ${stepId}`);
  return found;
}

function findIn(step: OutlineStep, stepId: string): OutlineStep | undefined {
  if (step.stepId === stepId) return step;
  const children = [...step.calls, ...(step.async ? [step.async] : [])];
  return children.map((child) => findIn(child, stepId)).find(Boolean);
}

/** The record's outline and its text version line. */
export function stage(record: ProjectRecord, workflowId: string): string[] {
  const { outline } = detailsOf(record, workflowId);
  const workflow = record.project.workflows.find((w) => w.id === workflowId);
  if (workflow === undefined) throw new Error(`No ${workflowId}`);
  return [
    ...outlineLines(outline, ""),
    `Text version: ${workflowPathText(record.project, workflow)}`,
  ];
}

/** Where a sequence is: the record, what can be undone, and what to print. */
export interface Place {
  readonly record: ProjectRecord;
  readonly history: EditHistory;
  readonly lines: readonly string[];
}

/** The place before any command, printed as "Start". */
export function beginning(record: ProjectRecord, workflowId: string): Place {
  return {
    record,
    history: NO_EDITS,
    lines: ["Start", ...stage(record, workflowId)],
  };
}

/** A command's result, and its step in the history. */
export interface CommandInput {
  readonly from: Place;
  readonly workflowId: string;
  readonly command: (record: ProjectRecord) => ProjectRecord;
  readonly description: string;
  /** What Remove would ask, as the outline words it, if the command is a remove. */
  readonly asks?: string;
  /** A line after the description, for what the outline doesn't show. */
  readonly note?: string;
  /** What the screen announces, if the sequence shows it. */
  readonly announcement?: string;
}

/** Runs a command on the place's record, recording its step. */
export function apply(input: CommandInput): Place {
  const { from, workflowId, command, description } = input;
  const record = command(from.record);
  const history = recordEdit(from.history, {
    description,
    before: from.record,
    after: record,
  });
  const { asks, note, announcement } = input;
  return {
    record,
    history,
    lines: [
      "",
      ...(asks ? [asks] : []),
      description,
      ...(announcement ? [`Announces: ${announcement}`] : []),
      ...(note ? [note] : []),
      ...stage(record, workflowId),
    ],
  };
}

/** Undoes the last step, printing the edges the architecture has then. */
export function undo(from: Place, workflowId: string): Place {
  const move = undoEdit(from.history);
  if (move === undefined) throw new Error("Nothing to undo");
  return {
    record: move.to,
    history: move.history,
    lines: [
      "",
      `Undo: ${move.step.description}`,
      `Edges: ${String(edgeCount(move.to))}`,
      ...stage(move.to, workflowId),
    ],
  };
}

/** How many edges the architecture has. */
export function edgeCount(record: ProjectRecord): number {
  return record.project.architecture.edges.length;
}

/** A step, by id, in its workflow. */
export interface StepRef {
  readonly workflowId: string;
  readonly stepId: string;
}

/** What Remove asks about the step, or that it goes at once. */
export function asking(record: ProjectRecord, ref: StepRef): string {
  const { outline } = detailsOf(record, ref.workflowId);
  const { editing } = stepIn(outline, ref.stepId);
  return `Remove asks: ${editing?.removal?.question ?? "nothing; the step goes at once"}`;
}

/** Two components to connect, by id, in a place's workflow. */
export interface ConnectInput {
  readonly from: Place;
  readonly workflowId: string;
  /** The caller's component id. */
  readonly fromId: string;
  /** The callee's component id. */
  readonly toId: string;
}

/**
 * Draws an edge between two components on its own, as "Connect to…" does:
 * a call goes only along an edge that's there, so it comes first, and the
 * edge's id and settings come from `NewEdge`, as on the screen.
 */
export function connect({
  from,
  workflowId,
  fromId,
  toId,
}: ConnectInput): Place {
  const { project } = from.record;
  const connection = new NewEdge({
    registry: createAwsComponentRegistry(),
    ids: new SequentialIds(`edge-${fromId}`),
  }).execute({ project, from: fromId, to: toId });
  if (connection === undefined) throw new Error(`No type for ${fromId}`);
  const nameOf = (id: string) =>
    project.architecture.components.find((c) => c.id === id)?.name ?? id;
  const between = `${nameOf(fromId)} to ${nameOf(toId)}`;
  return apply({
    from,
    workflowId,
    command: (r) => connectComponents(r, connection),
    description: `Connect ${between}`,
    note: `Edges: ${String(edgeCount(from.record) + 1)} (${nameOf(fromId)} → ${nameOf(toId)} is new)`,
  });
}
