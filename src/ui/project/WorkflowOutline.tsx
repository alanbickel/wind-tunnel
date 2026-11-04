import { useId } from "react";
import type {
  OutlineStep,
  WorkflowDetails,
} from "../../application/details/details";
import type { Selection } from "../../application/details/selection";
import {
  ASYNC_WORK_HEADING,
  usedByLine,
} from "../../application/details/workflow-details";
import styles from "./WorkflowOutline.module.css";

export interface WorkflowOutlineProps {
  readonly details: WorkflowDetails;
  /** Selects a step of the outline. */
  readonly onSelect: (selection: Selection) => void;
}

/**
 * A workflow's Details: the workloads that use it, then its steps as a
 * numbered outline, each a button that selects it, marked current while
 * it's the selection (UX design §2.5 step 3), with its run issues under
 * it. An `enqueue` step's async work is under it, read-only for now.
 */
export function WorkflowOutline({ details, onSelect }: WorkflowOutlineProps) {
  const { workflowId, usedBy, outline, currentStepId } = details;
  const item = {
    currentStepId,
    onSelect: (stepId: string) => {
      onSelect({ kind: "step", workflowId, stepId });
    },
  };
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
 * A step's line, and its run issues under it, if it has any: set off by a
 * line down their side, so the mark doesn't rely on color, and describing
 * the step's button, so a screen reader hears them on it (UX design §2.5
 * step 7).
 */
function StepLine(props: OutlineItemProps) {
  const issuesId = useId();
  const { issues } = props.step;
  if (issues.length === 0) {
    return <StepButton {...props} describedBy={undefined} />;
  }
  return (
    <div className={styles.cantRun}>
      <StepButton {...props} describedBy={issuesId} />
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

interface StepButtonProps extends OutlineItemProps {
  /** The ID of what says the step's issues; undefined for none. */
  readonly describedBy: string | undefined;
}

/**
 * A step's line, marked current while it's the selection. Not
 * `aria-pressed`: pressing it again selects it again, so it isn't a toggle.
 */
function StepButton(props: StepButtonProps) {
  const { step, currentStepId, onSelect, describedBy } = props;
  return (
    <button
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

interface OutlineItemProps {
  readonly step: OutlineStep;
  readonly currentStepId: string | undefined;
  readonly onSelect: (stepId: string) => void;
}

/** One step's line, then the steps it calls, then its async work. */
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
