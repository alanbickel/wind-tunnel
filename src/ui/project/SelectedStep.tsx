import { useRef, type RefObject } from "react";
import type { StepDetails } from "../../application/details/details";
import type { Selection } from "../../application/details/selection";
import { Button } from "../shared/Button";
import { DetailsHeading } from "./DetailsHeading";
import { StepSettings } from "./fields/StepSettings";
import { RemoveConfirmation } from "./RemoveConfirmation";
import styles from "./SelectionDetails.module.css";
import { useConfirming } from "./useConfirming";
import type { FocusAfterRedraw } from "./useFocusAfterRedraw";
import type { Edit } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";
import { useStepEdits } from "./useStepEdits";

export interface SelectedStepProps {
  readonly details: StepDetails;
  readonly selection: Selection;
  readonly takeFocus: ProjectSelection["takeFocus"];
  /** Saves the step's remove, and a change to its request settings. */
  readonly onEdit: (edit: Edit) => void;
  /** Selects the step's caller once the step is removed. */
  readonly onSelect: ProjectSelection["selectWithin"];
  /** Says what the remove, or a setting's save, did, in Details' polite region. */
  readonly announce: (message: string) => void;
  /** The outline's step lines, so the focus can go to the caller's. */
  readonly stepRows: FocusAfterRedraw;
  /** Clears the selection: the narrow layout's Close. */
  readonly onClose: () => void;
  /** Shows a Close button beside the heading, as the narrow layout does. */
  readonly closable: boolean;
}

/**
 * A selected step in the inspector (UX design §5): what it calls, which
 * workflow it's in, how a request reaches it and along which edge, its run
 * issues, its request settings (ADR-0024), and Remove. Its place in the workflow, and the edits that change
 * it, are the outline's, in the Workflows tab. The first step has no
 * Remove: removing it is removing the workflow.
 */
export function SelectedStep(props: SelectedStepProps) {
  const { details, onEdit, announce } = props;
  const { issues } = details.step;
  return (
    <>
      {/* Keyed by the step, so a confirmation doesn't carry over. */}
      <StepHeader key={details.step.stepId} {...props} />
      <p className={styles.callers}>{details.arrival}</p>
      {issues.map((issue) => (
        <p key={issue} className={styles.warning}>
          {issue}
        </p>
      ))}
      {/* Keyed by the step, so a draft doesn't carry over to another's. */}
      <StepSettings
        key={`settings-${details.step.stepId}`}
        details={details}
        onEdit={onEdit}
        announce={announce}
      />
    </>
  );
}

/**
 * The heading, Remove, and Close, if there is one. Remove asks first if the
 * step has calls under it, as the outline's does; either way the focus then
 * goes to the caller's line in the outline, which the selection moves to
 * (UX design §5, "When the selected thing goes").
 */
function StepHeader(props: SelectedStepProps) {
  const { details, onClose, closable } = props;
  const { editing } = details.step;
  const openerRef = useRef<HTMLButtonElement>(null);
  const { open, press, remove, cancel } = useStepRemove(props, openerRef);
  return (
    <>
      <div className={styles.header}>
        <StepHeading {...props} />
        <div className={styles.actions}>
          {editing !== undefined && !open && (
            <Button ref={openerRef} onClick={press}>
              Remove
            </Button>
          )}
          {closable && <Button onClick={onClose}>Close</Button>}
        </div>
      </div>
      {open && editing?.removal && (
        <RemoveConfirmation
          text={editing.removal}
          onConfirm={remove}
          onCancel={cancel}
        />
      )}
    </>
  );
}

/** "Table · read · Step 1.1.1 of Read item": what it calls, and where it is. */
function StepHeading({ details, selection, takeFocus }: SelectedStepProps) {
  const { step, workflowName } = details;
  return (
    <DetailsHeading selection={selection} takeFocus={takeFocus}>
      {step.label}
      <span className={styles.kind}>
        {" "}
        · Step {step.number} of {workflowName}
      </span>
    </DetailsHeading>
  );
}

/** Whether a step's question is open, and what its Remove does. */
interface StepRemove {
  readonly open: boolean;
  /** Removes at once, or opens the question if the step has calls under it. */
  readonly press: () => void;
  /** Removes the step, and sends the focus to its caller's line. */
  readonly remove: () => void;
  readonly cancel: () => void;
}

/**
 * The step's Remove: its question, and what pressing it does. Cancel
 * returns the focus to Remove, `openerRef`'s button.
 */
function useStepRemove(
  props: SelectedStepProps,
  openerRef: RefObject<HTMLButtonElement | null>,
): StepRemove {
  const { details, onEdit, onSelect, announce, stepRows } = props;
  const { step, workflowId } = details;
  const edits = useStepEdits({ workflowId, onEdit, onSelect, announce });
  const { open, ask, cancel } = useConfirming(openerRef);
  const remove = () => {
    const caller = step.editing?.callerStepId;
    if (caller !== undefined) stepRows.after(caller);
    edits.remove(step);
  };
  const press = () => {
    if (step.editing?.removal === undefined) remove();
    else ask();
  };
  return { open, press, remove, cancel };
}
