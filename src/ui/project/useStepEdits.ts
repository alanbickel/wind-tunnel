import { useCallback, useMemo } from "react";
import type {
  OutlineStep,
  WorkflowDetails,
} from "../../application/details/details";
import {
  moveStep,
  removeStep,
  type StepDirection,
} from "../../application/edits/workflow-edits";
import type { Edit } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";

/** What the outline does to a step. */
export interface StepEdits {
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
 * A workflow's step commands (UX design §2.5 steps 5 and 6), each saved
 * like any other edit and named for Undo by the step's label: "Move
 * orders-db · read up", "Remove fn-orders · invoke". A move says "Moved …"
 * and a remove "Removed …", from Details' region, since the focus stays in
 * the outline.
 */
export function useStepEdits(input: StepEditsInput): StepEdits {
  const move = useMove(input);
  const remove = useRemove(input);
  return useMemo(() => ({ move, remove }), [move, remove]);
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
