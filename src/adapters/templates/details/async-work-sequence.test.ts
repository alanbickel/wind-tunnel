import { describe, expect, it } from "vitest";
import { addAsyncWorkText } from "../../../application/details/add-async-work-text";
import { addCallText } from "../../../application/details/add-call-text";
import { changeStepText } from "../../../application/details/change-step-text";
import {
  addComponent,
  renameComponent,
} from "../../../application/edits/component-edits";
import {
  addAsyncWork,
  addCall,
  changeStep,
  removeStep,
} from "../../../application/edits/workflow-edits";
import type { ProjectRecord } from "../../../application/ports/project-record";
import {
  awsChangeStep,
  awsNewCall,
} from "../../../application/testing/aws-component-types";
import {
  lambdaDefinition,
  sqsDefinition,
} from "../../../domain/components/aws";
import { findRunIssues } from "../../../domain/components/find-run-issues";
import { simulateWithMetrics } from "../../../domain/metrics/metrics-collector";
import { componentIn } from "../../../domain/metrics/testing/snapshot-lookups";
import type { Project, Step } from "../../../domain/model/project";
import { registry } from "../testing/run-template";
import { projectA } from "../testing/scenario-runs";
import {
  apply,
  asking,
  beginning,
  edgeCount,
  undo,
  type Place,
} from "./edit-sequence";

// UX design §2.6's sketch, end to end, in a copy of Template A: a queue and a
// function are added, then three calls and their three edges are made with
// the workflow editor's commands, through the same edit history the screen
// keeps, and each is undone in turn. The stages are in
// docs/architecture/workflow-editor.md ("Async work"). Accept an intended
// change with `npx vitest run src/adapters/templates/details --update`, then
// check the guide still matches.

const WORKFLOW_ID = "create-order";
const WRITE_STEP = "create-order-orders-db";

/** Template A with "orders-queue" (SQS) and "fn-writer" (Lambda), as "Add component" and rename leave them. */
function withQueueAndWriter(): ProjectRecord {
  const base: ProjectRecord = {
    project: projectA,
    layout: { nodes: {} },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const withQueue = addComponent(base, {
    componentId: "orders-queue",
    type: "sqs",
    defaultConfig: sqsDefinition.defaultConfig,
  });
  const withWriter = addComponent(withQueue, {
    componentId: "fn-writer",
    type: "lambda",
    defaultConfig: lambdaDefinition.defaultConfig,
  });
  return renameComponent(
    renameComponent(withWriter, {
      componentId: "orders-queue",
      name: "orders-queue",
    }),
    { componentId: "fn-writer", name: "fn-writer" },
  );
}

const START = withQueueAndWriter();
const BEGINNING = beginning(START, WORKFLOW_ID);
// One generator for both adds, so the async root's id and the call under it
// differ.
const newCall = awsNewCall();

/** Step 1: fn-orders' `orders-db · write` changed to `orders-queue · enqueue`, adding fn-orders → orders-queue. */
function changedToEnqueue(from: Place): Place {
  const start = awsChangeStep().execute({
    project: from.record.project,
    workflowId: WORKFLOW_ID,
    stepId: WRITE_STEP,
  });
  if (start === undefined) throw new Error("The write can be changed");
  const text = changeStepText({
    fromLabel: start.label,
    toLabel: "orders-queue · enqueue",
    stepsBelow: start.stepsBelow,
    toEnqueue: true,
    edge: { callerName: "fn-orders", calleeName: "orders-queue" },
  });
  return apply({
    from,
    workflowId: WORKFLOW_ID,
    command: (r) =>
      changeStep(r, {
        workflowId: WORKFLOW_ID,
        stepId: WRITE_STEP,
        componentId: "orders-queue",
        action: "enqueue",
        edgeId: start.edgeId,
        edgeSettings: start.edgeSettings,
      }),
    description: text.undoName,
    announcement: text.announcement,
    note: `Edges: ${String(edgeCount(from.record) + 1)} (fn-orders → orders-queue is new)`,
  });
}

/** The id the async root gets, and what `addedAsyncWork` made it from. */
interface AsyncRoot {
  readonly place: Place;
  readonly rootId: string;
}

/** Step 2: fn-writer's `invoke` as the queue's async work, adding orders-queue → fn-writer. */
function addedAsyncWork(from: Place): AsyncRoot {
  const start = newCall.execute({
    project: from.record.project,
    workflowId: WORKFLOW_ID,
    stepId: WRITE_STEP,
  });
  if (start === undefined) throw new Error("The queue takes async work");
  const text = addAsyncWorkText({
    queueName: start.callerName,
    consumerName: "fn-writer",
    addsEdge: true,
  });
  const place = apply({
    from,
    workflowId: WORKFLOW_ID,
    command: (r) =>
      addAsyncWork(r, {
        workflowId: WORKFLOW_ID,
        stepId: WRITE_STEP,
        asyncId: start.callId,
        componentId: "fn-writer",
        action: "invoke",
        edgeId: start.edgeId,
        edgeSettings: start.edgeSettings,
      }),
    description: text.undoName,
    announcement: text.announcement,
    note: `Edges: ${String(edgeCount(from.record) + 1)} (orders-queue → fn-writer is new)`,
  });
  return { place, rootId: start.callId };
}

/** Step 3: orders-db's `write` under fn-writer, adding fn-writer → orders-db. */
function addedWrite(from: AsyncRoot): Place {
  const start = newCall.execute({
    project: from.place.record.project,
    workflowId: WORKFLOW_ID,
    stepId: from.rootId,
  });
  if (start === undefined) throw new Error("The async root takes a call");
  const text = addCallText({
    callerName: start.callerName,
    calleeName: "orders-db",
    addsEdge: true,
  });
  return apply({
    from: from.place,
    workflowId: WORKFLOW_ID,
    command: (r) =>
      addCall(r, {
        workflowId: WORKFLOW_ID,
        stepId: from.rootId,
        callId: start.callId,
        componentId: "orders-db",
        action: "write",
        edgeId: start.edgeId,
        edgeSettings: start.edgeSettings,
      }),
    description: text.undoName,
    announcement: text.announcement,
    note: `Edges: ${String(edgeCount(from.place.record) + 1)} (fn-writer → orders-db is new)`,
  });
}

/** The architecture's edges as "from → to". */
function edgeNames(record: ProjectRecord): string[] {
  const names = new Map(
    record.project.architecture.components.map((c) => [c.id, c.name]),
  );
  return record.project.architecture.edges.map(
    (e) => `${names.get(e.from) ?? "?"} → ${names.get(e.to) ?? "?"}`,
  );
}

/** The workflow's steps, with the async root named. */
function steps(record: ProjectRecord): Step[] {
  const workflow = record.project.workflows.find((w) => w.id === WORKFLOW_ID);
  if (workflow === undefined) throw new Error("No Create order");
  const all: Step[] = [];
  const walk = (step: Step): void => {
    all.push(step);
    [...(step.calls ?? []), ...(step.async ? [step.async] : [])].forEach(walk);
  };
  walk(workflow.root);
  return all;
}

/** A short run of "Create order" alone, so its messages are the whole load. */
function createOrderRun(project: Project) {
  const workload = project.workloads[0];
  if (workload === undefined) throw new Error("Template A has a workload");
  const short = {
    ...workload,
    durationMs: 5_000,
    mix: [{ workflowId: WORKFLOW_ID, weight: 1 }],
    profile: [{ atMs: 0, requestsPerSec: 50 }],
  };
  return simulateWithMetrics({
    project: { ...project, workloads: [short] },
    workloadId: short.id,
    registry,
  });
}

describe("the async-work sketch (UX design §2.6)", () => {
  // Fails if any stage's outline, text version, undo name or announcement
  // changes, so the guide's example no longer matches what the commands
  // do; if a call along a missing edge adds none, adds the wrong one, or
  // its undo leaves the edge or the call behind (each undo must give back
  // the very record from before); if removing the async root takes an edge
  // or the queue's other calls; if the result has a run issue; or if a run
  // of it delivers no message to its consumer.
  it("builds the sketch in three calls and their edges, and undoes each", async () => {
    const changed = changedToEnqueue(BEGINNING);
    const added = addedAsyncWork(changed);
    const written = addedWrite(added);
    const undoneWrite = undo(written, WORKFLOW_ID);
    const undoneAsync = undo(undoneWrite, WORKFLOW_ID);
    const undoneChange = undo(undoneAsync, WORKFLOW_ID);
    const removed = apply({
      from: written,
      workflowId: WORKFLOW_ID,
      command: (r) =>
        removeStep(r, { workflowId: WORKFLOW_ID, stepId: added.rootId }),
      description: "Remove fn-writer · invoke",
      asks: asking(written.record, {
        workflowId: WORKFLOW_ID,
        stepId: added.rootId,
      }),
      announcement:
        "Removed fn-writer · invoke. orders-queue · enqueue has no async work now.",
    });
    const places = [
      BEGINNING,
      changed,
      added.place,
      written,
      undoneWrite,
      undoneAsync,
      undoneChange,
      removed,
    ];

    const text = `${places.flatMap((place) => place.lines).join("\n")}\n`;

    await expect(text).toMatchFileSnapshot("async-work-sequence.txt");
    expect(edgeNames(written.record)).toEqual([
      ...edgeNames(START),
      "fn-orders → orders-queue",
      "orders-queue → fn-writer",
      "fn-writer → orders-db",
    ]);
    expect(edgeNames(written.record)).toContain("fn-orders → orders-db");
    expect(undoneWrite.record).toBe(added.place.record);
    expect(undoneAsync.record).toBe(changed.record);
    expect(undoneChange.record).toBe(START);
    expect(removed.record.project.architecture).toBe(
      written.record.project.architecture,
    );
    expect(steps(removed.record).map((s) => s.id)).toEqual([
      "create-order-api",
      "create-order-fn-orders",
      WRITE_STEP,
    ]);
  });

  // Fails if the finished sketch has a run issue, or a run of it delivers
  // no message from the queue to fn-writer (the async root isn't wired to
  // the queue's consumer edge), or loses any it takes.
  it("has no run issues, and a run of it delivers messages", () => {
    const { record } = addedWrite(addedAsyncWork(changedToEnqueue(BEGINNING)));

    const issues = findRunIssues(record.project, registry);
    const { totals } = createOrderRun(record.project);

    expect(issues.workflows.get(WORKFLOW_ID)).toEqual([]);
    const queue = componentIn(totals, "orders-queue");
    expect(queue.asyncSucceeded).toBeGreaterThan(0);
    expect(queue.asyncFailed).toBe(0);
  });
});
