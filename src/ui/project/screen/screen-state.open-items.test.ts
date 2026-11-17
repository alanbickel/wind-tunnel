import { describe, expect, it } from "vitest";
import type { Selection } from "../../../application/details/selection";
import { INITIAL_SCREEN_STATE } from "./screen-state";
import {
  WORKFLOW,
  WORKLOAD,
  ALL_BUT_WORKLOAD,
  OF_A_WORKFLOW,
  NOT_OF_A_WORKFLOW,
  SELECT,
  CLEAR,
  SHOW,
  FOLD,
  RUN,
  PICK,
  EVERY_TAB,
  after,
} from "./testing/screen-map";

// UX design §5's map, for what the Workflows and Workloads tabs hold open:
// a selection of a workflow, a step, or a workload opens its item in its
// tab, and the tab keeps it while anything else happens (rule 3).

describe("rule 3: each tab keeps what it has open", () => {
  // Fails if selecting a workload doesn't show the Workloads tab, unfolded,
  // or doesn't open the workload there, from any tab.
  it.each(EVERY_TAB)(
    "a workload shows the Workloads tab, with its editor open, from %s",
    (tab) => {
      expect(after(SHOW(tab), FOLD, SELECT(WORKLOAD))).toMatchObject({
        dock: { shown: "workloads", folded: false },
        openWorkloadId: "rush",
      });
    },
  );

  // Fails if a screen opens with a workload open in the tab: one opens
  // only as it's selected.
  it("opens with no workload open in the tab", () => {
    expect(INITIAL_SCREEN_STATE.openWorkloadId).toBeUndefined();
  });

  // Fails if anything but selecting a workload changes the one open in the
  // Workloads tab: selecting a component, or any other kind, clearing,
  // Run, a pick, or the dock's own changes (rule 3: each tab keeps what
  // it has open while another shows).
  it.each([
    ...ALL_BUT_WORKLOAD.map(
      (s) => [`selecting a ${s.kind}`, SELECT(s)] as const,
    ),
    ["clearing the selection", CLEAR] as const,
    ["Run", RUN] as const,
    ["picking another workload", PICK("lunch")] as const,
    ["showing another tab", SHOW("library")] as const,
    ["folding the dock", FOLD] as const,
  ])("keeps the tab's workload open on %s", (_, transition) => {
    expect(after(SELECT(WORKLOAD), transition).openWorkloadId).toBe("rush");
  });

  // Fails if selecting another workload leaves the first open in the tab.
  it("selecting another workload opens it in the tab instead", () => {
    const other: Selection = { kind: "workload", workloadId: "lunch" };
    expect(after(SELECT(WORKLOAD), SELECT(other)).openWorkloadId).toBe("lunch");
  });

  // Fails if selecting a workflow or a step doesn't show the Workflows
  // tab, unfolded, or doesn't open its workflow there, from any tab.
  describe.each(OF_A_WORKFLOW)("a $kind", (selection) => {
    it.each(EVERY_TAB)(
      "shows the Workflows tab, with its workflow open, from %s",
      (tab) => {
        expect(after(SHOW(tab), FOLD, SELECT(selection))).toMatchObject({
          dock: { shown: "workflows", folded: false },
          openWorkflowId: "order",
        });
      },
    );
  });

  // Fails if a screen opens with a workflow open in the tab: one opens
  // only as it, or one of its steps, is selected.
  it("opens with no workflow open in the tab", () => {
    expect(INITIAL_SCREEN_STATE.openWorkflowId).toBeUndefined();
  });

  // Fails if anything but selecting a workflow or a step changes the one
  // open in the Workflows tab: selecting a component (as clicking the
  // boxes of its path does), or any other kind, clearing, Run, a pick, or
  // the dock's own changes (rule 3).
  it.each([
    ...NOT_OF_A_WORKFLOW.map(
      (s) => [`selecting a ${s.kind}`, SELECT(s)] as const,
    ),
    ["clearing the selection", CLEAR] as const,
    ["Run", RUN] as const,
    ["picking a workload", PICK("lunch")] as const,
    ["showing another tab", SHOW("library")] as const,
    ["folding the dock", FOLD] as const,
  ])("keeps the tab's workflow open on %s", (_, transition) => {
    expect(after(SELECT(WORKFLOW), transition).openWorkflowId).toBe("order");
  });

  // Fails if selecting another workflow, or a step in one, leaves the
  // first open in the tab.
  it.each([
    ["another workflow", { kind: "workflow", workflowId: "create" }],
    ["a step of another", { kind: "step", workflowId: "create", stepId: "c1" }],
  ] as const)("selecting %s opens it in the tab instead", (_, other) => {
    expect(after(SELECT(WORKFLOW), SELECT(other)).openWorkflowId).toBe(
      "create",
    );
  });

  // Fails if a workflow's selection changes the workload open in the
  // Workloads tab, or a workload's the workflow open in the Workflows
  // tab: each tab keeps its own.
  it("keeps each tab's open item as the other's is selected", () => {
    expect(after(SELECT(WORKLOAD), SELECT(WORKFLOW))).toMatchObject({
      openWorkloadId: "rush",
      openWorkflowId: "order",
    });
    expect(after(SELECT(WORKFLOW), SELECT(WORKLOAD))).toMatchObject({
      openWorkloadId: "rush",
      openWorkflowId: "order",
    });
  });
});

describe("rule 2: a workflow's or a step's selection unfolds the dock", () => {
  // Fails if selecting a workflow or a step leaves a folded dock folded,
  // so its outline is hidden, the same one again included.
  it.each(OF_A_WORKFLOW)(
    "unfolds it on Workflows on selecting a $kind",
    (selection) => {
      const again = after(SELECT(selection), FOLD, SELECT(selection));
      expect(again.dock).toEqual({ shown: "workflows", folded: false });
    },
  );
});
