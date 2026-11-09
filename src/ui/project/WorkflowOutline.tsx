import { useId, useRef, type RefObject } from "react";
import type {
  OutlineStep,
  StepEditing,
  WorkflowDetails,
} from "../../application/details/details";
import type { StepDirection } from "../../application/edits/workflow-edits";
import {
  ASYNC_WORK_HEADING,
  usedByLine,
} from "../../application/details/workflow-details";
import type { Project } from "../../domain/model/project";
import { Button } from "../shared/Button";
import { AddCall } from "./AddCall";
import { RemoveConfirmation } from "./RemoveConfirmation";
import { useConfirming } from "./useConfirming";
import type { Edit } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";
import { useStepEdits, type AddedCall } from "./useStepEdits";
import {
  useFocusAfterRedraw,
  type StepButtonRefs,
} from "./useFocusAfterRedraw";
import styles from "./WorkflowOutline.module.css";

export interface WorkflowOutlineProps {
  readonly project: Project;
  readonly details: WorkflowDetails;
  /** Selects a step of the outline. */
  readonly onSelect: ProjectSelection["selectWithin"];
  /** Saves a step's move or remove. */
  readonly onEdit: (edit: Edit) => void;
  /** Says a message in Details' polite region. */
  readonly announce: (message: string) => void;
}

/**
 * A workflow's Details: the workloads that use it, then its steps as a
 * numbered outline, each a button that selects it, marked current while
 * it's the selection (UX design §2.5 step 3), with its run issues under
 * it. A step that's one of a step's calls has Move up, Move down, and
 * Remove (§2.5 steps 5 and 6), and each step that can take one has "Add a
 * call from …" under its calls (§2.5 step 3). An `enqueue` step's async
 * work is under it, read-only for now.
 */
export function WorkflowOutline(props: WorkflowOutlineProps) {
  const { usedBy, outline } = props.details;
  const item = useOutlineItem(props);
  return (
    <>
      <p className={styles.usedBy}>{usedByLine(usedBy)}</p>
      <ol aria-label="Steps" className={styles.outline}>
        <OutlineItem step={outline} {...item} />
      </ol>
    </>
  );
}

/**
 * What every line draws from and does. Adding a call or removing a step
 * takes the button the focus was on away, so each asks for the focus to go
 * to a step's line once the outline has drawn again: the new step's, or the
 * removed step's caller's.
 */
function useOutlineItem(props: WorkflowOutlineProps): OutlineItemContext {
  const { project, details, onSelect } = props;
  const { workflowId, currentStepId } = details;
  const edits = useStepEdits(props);
  const focus = useFocusAfterRedraw();
  return {
    currentStepId,
    project,
    workflowId,
    buttons: focus.buttons,
    onSelect: (stepId: string) => {
      onSelect({ kind: "step", workflowId, stepId });
    },
    onMove: edits.move,
    onAdd: (call: AddedCall) => {
      focus.after(call.start.callId);
      edits.add(call);
    },
    onRemove: (step) => {
      const caller = step.editing?.callerStepId;
      if (caller !== undefined) focus.after(caller);
      edits.remove(step);
    },
  };
}

/** What every line of the outline is drawn from, and what it does. */
interface OutlineItemContext {
  readonly currentStepId: string | undefined;
  readonly project: Project;
  readonly workflowId: string;
  /** Remembers each step's button, to put the focus on one. */
  readonly buttons: StepButtonRefs;
  readonly onSelect: (stepId: string) => void;
  readonly onMove: (step: OutlineStep, direction: StepDirection) => void;
  readonly onRemove: (step: OutlineStep) => void;
  readonly onAdd: (call: AddedCall) => void;
}

interface OutlineItemProps extends OutlineItemContext {
  readonly step: OutlineStep;
}

/**
 * A step's line, and its run issues under it, if it has any: set off by a
 * line down their side, so the mark doesn't rely on color, and describing
 * the step's button, so a screen reader hears them on it (UX design §2.5
 * step 7).
 */
function StepLine(props: OutlineItemProps) {
  const issuesId = useId();
  const { issues } = props.step;
  if (issues.length === 0) {
    return <StepRow {...props} describedBy={undefined} />;
  }
  return (
    <div className={styles.cantRun}>
      <StepRow {...props} describedBy={issuesId} />
      <div id={issuesId}>
        {issues.map((issue) => (
          <p key={issue} className={styles.issue}>
            {issue}
          </p>
        ))}
      </div>
    </div>
  );
}

interface StepRowProps extends OutlineItemProps {
  /** The ID of what says the step's issues; undefined for none. */
  readonly describedBy: string | undefined;
}

/**
 * The step's button and its edits, and under them the question Remove asks
 * first, if the step has steps under it: the focus goes to Cancel, and back
 * to Remove if it's cancelled. A step with none under it goes at once.
 */
function StepRow(props: StepRowProps) {
  const { step, onRemove } = props;
  const { editing } = step;
  const removal = useStepRemoval(props);
  return (
    <>
      <div className={styles.row}>
        <StepButton {...props} />
        {editing && (
          <StepActions
            {...props}
            editing={editing}
            removeRef={removal.removeRef}
            showRemove={!removal.open}
            onRemove={removal.press}
          />
        )}
      </div>
      {removal.open && editing?.removal && (
        <RemoveConfirmation
          text={editing.removal}
          onConfirm={() => {
            onRemove(step);
          }}
          onCancel={removal.cancel}
        />
      )}
    </>
  );
}

/** Whether a step's question is open, and what pressing its Remove does. */
interface StepRemoval {
  readonly removeRef: RefObject<HTMLButtonElement | null>;
  readonly open: boolean;
  /** Removes at once, or opens the question if the step has steps under it. */
  readonly press: () => void;
  readonly cancel: () => void;
}

/** A step's Remove: its question, and where the focus goes if it's cancelled. */
function useStepRemoval({ step, onRemove }: StepRowProps): StepRemoval {
  const removeRef = useRef<HTMLButtonElement>(null);
  const { open, ask, cancel } = useConfirming(removeRef);
  const press = () => {
    if (step.editing?.removal === undefined) onRemove(step);
    else ask();
  };
  return { removeRef, open, press, cancel };
}

/**
 * A step's line, marked current while it's the selection. Not
 * `aria-pressed`: pressing it again selects it again, so it isn't a toggle.
 */
function StepButton(props: StepRowProps) {
  const { step, currentStepId, buttons, onSelect, describedBy } = props;
  return (
    <button
      ref={buttons(step.stepId)}
      type="button"
      className={styles.step}
      aria-current={step.stepId === currentStepId || undefined}
      aria-describedby={describedBy}
      onClick={() => {
        onSelect(step.stepId);
      }}
    >
      <span className={styles.number}>{step.number}</span> {step.label}
    </button>
  );
}

interface StepActionsProps extends OutlineItemProps {
  readonly editing: StepEditing;
  readonly removeRef: RefObject<HTMLButtonElement | null>;
  /** False while the question is open: Remove is off the page then. */
  readonly showRemove: boolean;
}

/**
 * Move up, Move down, and Remove. Each is named for its step, since a
 * screen reader lists many of them; a move that can't go that way, at the
 * end of the step's siblings, is `aria-disabled`, and still takes the focus.
 */
function StepActions(props: StepActionsProps) {
  const { step, editing, removeRef, showRemove, onRemove } = props;
  const { moves } = editing;
  const name = `${step.number} ${step.label}`;
  return (
    <>
      {moves && (
        <MoveButton {...props} direction="up" usable={moves.canMoveUp} />
      )}
      {moves && (
        <MoveButton {...props} direction="down" usable={moves.canMoveDown} />
      )}
      {showRemove && (
        <Button
          ref={removeRef}
          label={`Remove ${name}`}
          onClick={() => {
            onRemove(step);
          }}
        >
          Remove
        </Button>
      )}
    </>
  );
}

interface MoveButtonProps extends StepActionsProps {
  readonly direction: StepDirection;
  readonly usable: boolean;
}

/** Move up or Move down, named for its step. */
function MoveButton({ step, direction, usable, onMove }: MoveButtonProps) {
  return (
    <Button
      usable={usable}
      label={`Move ${direction} ${step.number} ${step.label}`}
      onClick={() => {
        onMove(step, direction);
      }}
    >
      Move {direction}
    </Button>
  );
}

/**
 * One step's line, then the steps it calls, then "Add a call" if it can
 * take one, then its async work.
 */
function OutlineItem(props: OutlineItemProps) {
  const { step } = props;
  return (
    <li>
      <StepLine {...props} />
      {step.calls.length > 0 && (
        <ol className={styles.outline}>
          {step.calls.map((call) => (
            <OutlineItem key={call.stepId} {...props} step={call} />
          ))}
        </ol>
      )}
      {step.addCallLabel !== undefined && (
        <AddCall
          project={props.project}
          workflowId={props.workflowId}
          step={step}
          onAdd={props.onAdd}
        />
      )}
      {step.async && <AsyncWork {...props} step={step.async} />}
    </li>
  );
}

/**
 * An enqueue's async work, its first step as `step`. The label names the
 * list, so a screen reader that moves by list hears that it runs later.
 */
function AsyncWork(props: OutlineItemProps) {
  const labelId = useId();
  return (
    <div className={styles.async}>
      <p id={labelId} className={styles.asyncLabel}>
        {ASYNC_WORK_HEADING}
      </p>
      <ol aria-labelledby={labelId} className={styles.outline}>
        <OutlineItem {...props} />
      </ol>
    </div>
  );
}
