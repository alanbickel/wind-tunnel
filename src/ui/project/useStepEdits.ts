import { useCallback, useMemo } from "react";
import type {
  OutlineStep,
  WorkflowDetails,
} from "../../application/details/details";
import {
  addCallText,
  type AddCallText,
} from "../../application/details/add-call-text";
import type {
  CallChoice,
  NewCallStart,
} from "../../application/use-cases/new-call";
import type { StepAction } from "../../domain/model/project";
import {
  addCall,
  type AddCallInput,
  moveStep,
  removeStep,
  type StepDirection,
} from "../../application/edits/workflow-edits";
import type { Edit } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";

/** A call drafted under a step, once its component and action are chosen. */
export interface AddedCall {
  /** The step that gets the call. */
  readonly callerStepId: string;
  readonly start: NewCallStart;
  readonly choice: CallChoice;
  readonly action: StepAction;
}

/** What the outline does to a step. */
export interface StepEdits {
  /**
   * Adds the call as the last of its caller's calls, and its edge too if
   * the caller has none to the callee; saves it as one step, selects the
   * new step, and announces it.
   */
  readonly add: (call: AddedCall) => void;
  /** Moves the step one place among its siblings, saves, and announces it. */
  readonly move: (step: OutlineStep, direction: StepDirection) => void;
  /**
   * Removes the step and what's under it, saves, selects its caller, and
   * announces it. The outline moves the focus to the caller's line.
   */
  readonly remove: (step: OutlineStep) => void;
}

/** What a workflow's step edits save through and say. */
export interface StepEditsInput {
  readonly details: WorkflowDetails;
  readonly onEdit: (edit: Edit) => void;
  readonly onSelect: ProjectSelection["selectWithin"];
  /** Says a message in Details' polite region: the focus stays in the outline. */
  readonly announce: (message: string) => void;
}

/**
 * A workflow's step commands (UX design §2.5 steps 3, 5, and 6), each saved
 * like any other edit and named for Undo by the step's label: "Move
 * orders-db · read up", "Remove fn-orders · invoke". A move says "Moved …"
 * and a remove "Removed …", from Details' region, since the focus stays in
 * the outline; an added call is named for its two components.
 */
export function useStepEdits(input: StepEditsInput): StepEdits {
  const move = useMove(input);
  const remove = useRemove(input);
  const add = useAdd(input);
  return useMemo(() => ({ add, move, remove }), [add, move, remove]);
}

/** Add, as `StepEdits` describes it. */
function useAdd({
  details,
  onEdit,
  onSelect,
  announce,
}: StepEditsInput): StepEdits["add"] {
  const { workflowId } = details;
  return useCallback(
    (added: AddedCall) => {
      const text = textOf(added);
      onEdit({
        command: (record) => addCall(record, addCallInput(workflowId, added)),
        describe: () => text.undoName,
      });
      onSelect(
        { kind: "step", workflowId, stepId: added.start.callId },
        "none",
      );
      announce(text.announcement);
    },
    [workflowId, onEdit, onSelect, announce],
  );
}

/** The words for a drafted call: its two components, and whether it adds an edge. */
function textOf({ start, choice }: AddedCall): AddCallText {
  return addCallText({
    callerName: start.callerName,
    calleeName: choice.name,
    addsEdge: choice.addsEdge,
  });
}

/** What `addCall` needs, from a drafted call and its workflow. */
function addCallInput(workflowId: string, added: AddedCall): AddCallInput {
  const { callerStepId, start, choice, action } = added;
  return {
    workflowId,
    stepId: callerStepId,
    callId: start.callId,
    componentId: choice.componentId,
    action,
    edgeId: start.edgeId,
    edgeSettings: start.edgeSettings,
  };
}

/** Move, as `StepEdits` describes it. */
function useMove({
  details,
  onEdit,
  announce,
}: StepEditsInput): StepEdits["move"] {
  const { workflowId } = details;
  return useCallback(
    ({ stepId, label }: OutlineStep, direction: StepDirection) => {
      onEdit({
        command: (record) =>
          moveStep(record, { workflowId, stepId, direction }),
        describe: () => `Move ${label} ${direction}`,
      });
      announce(`Moved ${label} ${direction}.`);
    },
    [workflowId, onEdit, announce],
  );
}

/** Remove, as `StepEdits` describes it. */
function useRemove({
  details,
  onEdit,
  onSelect,
  announce,
}: StepEditsInput): StepEdits["remove"] {
  const { workflowId } = details;
  return useCallback(
    ({ stepId, label, editing }: OutlineStep) => {
      if (editing === undefined) return;
      onEdit({
        command: (record) => removeStep(record, { workflowId, stepId }),
        describe: () => `Remove ${label}`,
      });
      onSelect(
        { kind: "step", workflowId, stepId: editing.callerStepId },
        "none",
      );
      announce(`Removed ${label}.`);
    },
    [workflowId, onEdit, onSelect, announce],
  );
}
