import { useMemo, useState } from "react";
import type { OutlineStep } from "../../application/details/details";
import type { ChangeStepStart } from "../../application/use-cases/change-step";
import type { CallChoice } from "../../application/use-cases/call-choices";
import type { Project, StepAction } from "../../domain/model/project";
import { useUseCases } from "../app/useUseCases";
import { Picker, type PickerOption } from "./fields/Picker";
import styles from "./SelectionDetails.module.css";
import type { ChangedStep } from "./useStepEdits";

export interface ChangeStepProps {
  readonly project: Project;
  readonly workflowId: string;
  /** The selected step. */
  readonly step: OutlineStep;
  /** Saves the change, and announces it. */
  readonly onChange: (changed: ChangedStep) => void;
}

/**
 * The selected step's component and action pickers (UX design §2.5 step 6),
 * showing what it is now. Choosing an action, or a component whose type
 * accepts the step's action or only one, saves at once. A component that
 * leaves the action to choose holds a draft, here and nowhere else, so
 * nothing is saved until the action is chosen. Nothing for a step that
 * can't be changed: async work.
 */
export function ChangeStep({
  project,
  workflowId,
  step,
  onChange,
}: ChangeStepProps) {
  const { changeStep } = useUseCases();
  // Read again with the project: an Undo changes what the step is, and
  // what the pickers show must follow.
  const start = useMemo(
    () => changeStep.execute({ project, workflowId, stepId: step.stepId }),
    [changeStep, project, workflowId, step.stepId],
  );
  if (start === undefined) return null;
  return <ChangePickers start={start} step={step} onChange={onChange} />;
}

interface ChangePickersProps {
  readonly start: ChangeStepStart;
  readonly step: OutlineStep;
  readonly onChange: (changed: ChangedStep) => void;
}

/** What the pickers show, and what choosing in them does. */
interface StepDraft {
  /** The component shown: the one chosen while the action still has to be, else the step's. */
  readonly choice: CallChoice | undefined;
  /** True while a component is chosen and its action isn't. */
  readonly pending: boolean;
  readonly pickComponent: (picked: CallChoice) => void;
  readonly pickAction: (picked: CallChoice, action: StepAction) => void;
}

/**
 * The draft behind the pickers: the component chosen while the action
 * still has to be, if any. Saves, through `onChange`, as soon as both are
 * settled.
 */
function useStepDraft({
  start,
  step,
  onChange,
}: ChangePickersProps): StepDraft {
  const [pending, setPending] = useState<string>();
  const choice = start.choices.find(
    (c) => c.componentId === (pending ?? start.componentId),
  );
  const save = (picked: CallChoice, action: StepAction) => {
    setPending(undefined);
    onChange({ stepId: step.stepId, start, choice: picked, action });
  };
  const pickComponent = (picked: CallChoice) => {
    const action = actionAfter(picked, start.action);
    if (action === undefined) setPending(picked.componentId);
    else save(picked, action);
  };
  return {
    choice,
    pending: pending !== undefined,
    pickComponent,
    pickAction: save,
  };
}

/** The two pickers. */
function ChangePickers(props: ChangePickersProps) {
  const { start, step } = props;
  const { choice, pending, pickComponent, pickAction } = useStepDraft(props);
  return (
    <div
      role="group"
      aria-label={`Change step ${step.number}`}
      className={styles.firstStep}
    >
      <Picker
        label="Component"
        prompt="Choose a component"
        value={choice?.componentId}
        options={start.choices.map(componentOption)}
        onPick={(id) => {
          const picked = start.choices.find((c) => c.componentId === id);
          if (picked !== undefined) pickComponent(picked);
        }}
      />
      <ActionPicker
        start={start}
        choice={choice}
        pending={pending}
        onPick={pickAction}
      />
    </div>
  );
}

interface ActionPickerProps {
  readonly start: ChangeStepStart;
  readonly choice: CallChoice | undefined;
  readonly pending: boolean;
  readonly onPick: StepDraft["pickAction"];
}

/** The actions the shown component accepts; unusable, with the reason, if the step's can't change. */
function ActionPicker({ start, choice, pending, onPick }: ActionPickerProps) {
  const actions = choice?.actions ?? [];
  return (
    <Picker
      label="Action"
      prompt="Choose an action"
      value={pending ? undefined : start.action}
      options={actions.map((a) => ({ value: a, text: a }))}
      usable={start.actionLocked === undefined}
      explanation={start.actionLocked}
      onPick={(value) => {
        const action = actions.find((a) => a === value);
        if (choice !== undefined && action !== undefined)
          onPick(choice, action);
      }}
    />
  );
}

/** A component's option: its label, and the mark if choosing it adds an edge. */
function componentOption({
  componentId,
  label,
  note,
}: CallChoice): PickerOption {
  return { value: componentId, text: note ? `${label} · ${note}` : label };
}

/**
 * The action a step has after its component becomes `choice`: the one it
 * has, if the type accepts it, else the type's only action; else
 * undefined, and the user chooses.
 */
function actionAfter(
  { actions }: CallChoice,
  current: StepAction,
): StepAction | undefined {
  if (actions.includes(current)) return current;
  return actions.length === 1 ? actions[0] : undefined;
}
