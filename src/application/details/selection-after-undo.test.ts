import { describe, expect, it } from "vitest";
import { renameComponent, removeComponent } from "../edits/component-edits";
import { removeEdge } from "../edits/edge-edits";
import { addWorkflow } from "../edits/workflow-edits";
import { sampleRecord } from "../testing/sample-record";
import { selectionAfterUndo } from "./selection-after-undo";

const sample = sampleRecord.project;
const withoutTable = removeComponent(sampleRecord, {
  componentId: "table",
}).project;
const withoutEdge = removeEdge(sampleRecord, { edgeId: "api-fn" }).project;

describe("selectionAfterUndo", () => {
  // Fails if bringing back a component and its edges selects an edge, or
  // nothing, so the undone remove isn't selected again (UX §4.1).
  it("selects a component brought back with its edges", () => {
    const change = selectionAfterUndo({
      from: withoutTable,
      to: sample,
      selection: undefined,
    });

    expect(change).toEqual({
      kind: "select",
      selection: { kind: "component", componentId: "table" },
    });
  });

  // Fails if bringing back only an edge leaves the selection as it was.
  it("selects an edge brought back on its own", () => {
    const change = selectionAfterUndo({
      from: withoutEdge,
      to: sample,
      selection: { kind: "component", componentId: "fn" },
    });

    expect(change).toEqual({
      kind: "select",
      selection: { kind: "edge", edgeId: "api-fn" },
    });
  });

  // Fails if taking away the selected component or edge keeps the
  // selection, so Details would show something that isn't there.
  it("clears a selection the undo or redo takes away", () => {
    const component = { kind: "component", componentId: "table" } as const;
    const edge = { kind: "edge", edgeId: "api-fn" } as const;

    const changes = [
      selectionAfterUndo({
        from: sample,
        to: withoutTable,
        selection: component,
      }),
      selectionAfterUndo({ from: sample, to: withoutEdge, selection: edge }),
    ];

    expect(changes).toEqual([{ kind: "clear" }, { kind: "clear" }]);
  });

  // Fails if a step or a workflow is kept once the undo or redo takes it
  // away, or a step is looked for in another workflow than its own. No
  // edit removes a step yet (#117), so the projects are built here.
  it("clears a selected step or workflow the undo or redo takes away", () => {
    const [read] = sample.workflows;
    if (read === undefined) throw new Error("sample has no workflow");
    const withoutWorkflow = { ...sample, workflows: [] };
    const withoutStep = {
      ...sample,
      workflows: [{ ...read, root: { ...read.root, calls: [] } }],
    };
    const step = {
      kind: "step",
      workflowId: "read",
      stepId: "table-read",
    } as const;
    const elsewhere = { ...step, workflowId: "other" };
    const workflow = { kind: "workflow", workflowId: "read" } as const;

    const changes = [
      selectionAfterUndo({ from: sample, to: withoutStep, selection: step }),
      selectionAfterUndo({
        from: sample,
        to: withoutWorkflow,
        selection: step,
      }),
      selectionAfterUndo({ from: sample, to: sample, selection: elsewhere }),
      selectionAfterUndo({
        from: sample,
        to: withoutWorkflow,
        selection: workflow,
      }),
    ];

    expect(changes).toEqual([
      { kind: "clear" },
      { kind: "clear" },
      { kind: "clear" },
      { kind: "clear" },
    ]);
  });

  // Fails if an edit that leaves a selected step or workflow in the
  // project clears it, as Undo after a rename would.
  it("keeps a selected step or workflow that's still there", () => {
    const renamed = renameComponent(sampleRecord, {
      componentId: "table",
      name: "Orders",
    }).project;

    const changes = [
      selectionAfterUndo({
        from: renamed,
        to: sample,
        selection: { kind: "step", workflowId: "read", stepId: "table-read" },
      }),
      selectionAfterUndo({
        from: renamed,
        to: sample,
        selection: { kind: "workflow", workflowId: "read" },
      }),
    ];

    expect(changes).toEqual([{ kind: "keep" }, { kind: "keep" }]);
  });

  // Fails if undoing a remove takes the selection off a step or workflow
  // that's still there, to the component it brought back, so the outline
  // that shows the step's issue going would close.
  it("keeps a selected step or workflow through an undo that brings a component back", () => {
    const step = {
      kind: "step",
      workflowId: "read",
      stepId: "table-read",
    } as const;
    const workflow = { kind: "workflow", workflowId: "read" } as const;

    const changes = [
      selectionAfterUndo({ from: withoutTable, to: sample, selection: step }),
      selectionAfterUndo({
        from: withoutTable,
        to: sample,
        selection: workflow,
      }),
    ];

    expect(changes).toEqual([{ kind: "keep" }, { kind: "keep" }]);
  });

  // Fails if a change that leaves the selected thing in the project, or a
  // remove of something else, clears or changes the selection.
  it("keeps a selection that's still there", () => {
    const renamed = renameComponent(sampleRecord, {
      componentId: "table",
      name: "Orders",
    }).project;
    const fn = { kind: "component", componentId: "fn" } as const;

    const changes = [
      selectionAfterUndo({ from: renamed, to: sample, selection: fn }),
      selectionAfterUndo({ from: sample, to: withoutTable, selection: fn }),
      selectionAfterUndo({
        from: sample,
        to: withoutTable,
        selection: undefined,
      }),
    ];

    expect(changes).toEqual([
      { kind: "keep" },
      { kind: "keep" },
      { kind: "keep" },
    ]);
  });
});

describe("selectionAfterUndo of an added workflow", () => {
  // Fails if undoing an add keeps a selection that points at the workflow
  // it took away, so Details would show a workflow that isn't there.
  it("clears a selection that pointed at the workflow", () => {
    const added = addWorkflow(sampleRecord, {
      workflowId: "wf-new",
      rootStepId: "step-new",
      name: "Get order",
      componentId: "table",
      action: "read",
    }).project;

    const change = selectionAfterUndo({
      from: added,
      to: sample,
      selection: { kind: "workflow", workflowId: "wf-new" },
    });

    expect(change).toEqual({ kind: "clear" });
  });

  // Fails if undoing an add clears a draft: it isn't in the project, so no
  // undo takes it away.
  it("keeps a new-workflow draft", () => {
    const change = selectionAfterUndo({
      from: sample,
      to: sample,
      selection: { kind: "new-workflow" },
    });

    expect(change).toEqual({ kind: "keep" });
  });
});
