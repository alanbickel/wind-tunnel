import { useCallback, useMemo } from "react";
import type {
  OutlineStep,
  StepEditing,
  WorkflowDetails,
} from "../../application/details/details";
import {
  addCallText,
  type AddCallText,
} from "../../application/details/add-call-text";
import {
  addAsyncWorkText,
  emptiedSlotAnnouncement,
} from "../../application/details/add-async-work-text";
import type { CallChoice } from "../../application/use-cases/call-choices";
import type { NewCallStart } from "../../application/use-cases/new-call";
import type { StepAction } from "../../domain/model/project";
import {
  changeStepText,
  type ChangeStepText,
} from "../../application/details/change-step-text";
import type { ChangeStepStart } from "../../application/use-cases/change-step";
import {
  addAsyncWork,
  addCall,
  changeStep,
  type AddAsyncWorkInput,
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

/** A step changed to a component and an action, both chosen. */
export interface ChangedStep {
  readonly stepId: string;
  readonly start: ChangeStepStart;
  readonly choice: CallChoice;
  readonly action: StepAction;
}

/** What the outline does to a step. */
export interface StepEdits {
  /**
   * Adds the call as the last of its caller's calls, along an edge the
   * caller already has; saves it, selects the new step, and announces it.
   */
  readonly add: (call: AddedCall) => void;
  /**
   * Sets the `enqueue` step's async work, along an edge from its queue to
   * the consumer; saves it, selects the new step, and announces it.
   */
  readonly addAsync: (call: AddedCall) => void;
  /**
   * Changes the step's component and action; saves it and announces it.
   * The step keeps its id, so the selection stays on it.
   */
  readonly change: (changed: ChangedStep) => void;
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
  const addAsync = useAddAsync(input);
  const change = useChange(input);
  return useMemo(
    () => ({ add, addAsync, change, move, remove }),
    [add, addAsync, change, move, remove],
  );
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

/** Add async work, as `StepEdits` describes it. */
function useAddAsync({
  details,
  onEdit,
  onSelect,
  announce,
}: StepEditsInput): StepEdits["addAsync"] {
  const { workflowId } = details;
  return useCallback(
    (added: AddedCall) => {
      const text = addAsyncWorkText({
        queueName: added.start.callerName,
        consumerName: added.choice.name,
      });
      onEdit({
        command: (record) =>
          addAsyncWork(record, addAsyncWorkInput(workflowId, added)),
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

/** What `addAsyncWork` needs, from a drafted async root and its workflow. */
function addAsyncWorkInput(
  workflowId: string,
  { callerStepId, start, choice, action }: AddedCall,
): AddAsyncWorkInput {
  return {
    workflowId,
    stepId: callerStepId,
    asyncId: start.callId,
    componentId: choice.componentId,
    action,
  };
}

/** Change, as `StepEdits` describes it. */
function useChange({
  details,
  onEdit,
  announce,
}: StepEditsInput): StepEdits["change"] {
  const { workflowId } = details;
  return useCallback(
    (changed: ChangedStep) => {
      const { stepId, choice, action } = changed;
      const text = changeText(changed);
      onEdit({
        command: (record) =>
          changeStep(record, {
            workflowId,
            stepId,
            componentId: choice.componentId,
            action,
          }),
        describe: () => text.undoName,
      });
      announce(text.announcement);
    },
    [workflowId, onEdit, announce],
  );
}

/** What a step is called once it's changed to a component and an action. */
export function toLabelOf(choice: CallChoice, action: StepAction): string {
  return `${choice.name} · ${action}`;
}

/** The words for a changed step: its two labels, and what goes with it. */
function changeText({ start, choice, action }: ChangedStep): ChangeStepText {
  return changeStepText({
    fromLabel: start.label,
    toLabel: toLabelOf(choice, action),
    stepsBelow: start.stepsBelow,
    toEnqueue: action === "enqueue",
  });
}

/** The words for a drafted call: its two components. */
function textOf({ start, choice }: AddedCall): AddCallText {
  return addCallText({
    callerName: start.callerName,
    calleeName: choice.name,
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

/** What a remove says: an async root's also says its queue has no async work now. */
function removedText(label: string, { emptiesSlotOf }: StepEditing): string {
  if (emptiesSlotOf === undefined) return `Removed ${label}.`;
  return emptiedSlotAnnouncement({
    removedLabel: label,
    queueLabel: emptiesSlotOf,
  });
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
      announce(removedText(label, editing));
    },
    [workflowId, onEdit, onSelect, announce],
  );
}
