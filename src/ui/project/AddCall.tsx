import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { OutlineStep } from "../../application/details/details";
import type { Project, StepAction } from "../../domain/model/project";
import type {
  CallChoice,
  NewCallStart,
} from "../../application/use-cases/new-call";
import { useUseCases } from "../app/useUseCases";
import { Button } from "../shared/Button";
import { useFocusOnMount } from "../shared/useFocusOnMount";
import { Picker, type PickerOption } from "./fields/Picker";
import styles from "./SelectionDetails.module.css";
import { useConfirming } from "./useConfirming";
import type { AddedCall } from "./useStepEdits";

export interface AddCallProps {
  readonly project: Project;
  readonly workflowId: string;
  /** The step that gets the call: its `addCallLabel` is set. */
  readonly step: OutlineStep;
  /** Saves the call, selects it, and announces it. */
  readonly onAdd: (call: AddedCall) => void;
}

/**
 * "Add a call from api", under a step's calls (UX design §2.5 steps 3 and
 * 5): it opens a draft call, a component picker and an action picker,
 * which lives only here, so nothing is saved until both are chosen, and
 * Escape drops it and returns the focus to the button. The button is off
 * the page while the draft is open.
 */
export function AddCall(props: AddCallProps) {
  const { step } = props;
  const openerRef = useRef<HTMLButtonElement>(null);
  const { open, ask, cancel, dismiss } = useConfirming(openerRef);
  if (!open) {
    return (
      <div className={styles.addCall}>
        <Button
          ref={openerRef}
          expanded={false}
          label={`${step.addCallLabel ?? ""}, step ${step.number}`}
          onClick={ask}
        >
          {step.addCallLabel}
        </Button>
      </div>
    );
  }
  return <CallDraft {...props} onDrop={cancel} onSaved={dismiss} />;
}

interface CallDraftProps extends AddCallProps {
  /** Escape: closes the draft and returns the focus to its button. */
  readonly onDrop: () => void;
  /** The call saved: closes the draft; the screen places the focus. */
  readonly onSaved: () => void;
}

/** A component and an action, once chosen. */
interface Chosen {
  readonly componentId: string | undefined;
  readonly action: StepAction | undefined;
}

const NOTHING_CHOSEN: Chosen = { componentId: undefined, action: undefined };

/**
 * The draft's two pickers. The call saves once both are chosen: a
 * component whose type accepts one action has it chosen already.
 */
function CallDraft(props: CallDraftProps) {
  const { project, workflowId, step, onAdd, onDrop, onSaved } = props;
  const { newCall } = useUseCases();
  // Read again with the project: an Undo can change the components while
  // the draft is open, and a call must go to one that is there.
  const start = useMemo(
    () => newCall.execute({ project, workflowId, stepId: step.stepId }),
    [newCall, project, workflowId, step.stepId],
  );
  const [chosen, setChosen] = useState(NOTHING_CHOSEN);
  // The button that opened the draft is gone, so the focus moves to the
  // component picker; Escape works from there.
  const componentRef = useFocusOnMount<HTMLSelectElement>();
  if (start === undefined) return null;
  const change = (next: Chosen) => {
    setChosen(next);
    const choice = start.choices.find(
      (c) => c.componentId === next.componentId,
    );
    if (choice === undefined || next.action === undefined) return;
    onAdd({ callerStepId: step.stepId, start, choice, action: next.action });
    onSaved();
  };
  return (
    <DraftGroup label={step.addCallLabel} onDrop={onDrop}>
      <CallPickers
        start={start}
        chosen={chosen}
        componentRef={componentRef}
        onChange={change}
      />
    </DraftGroup>
  );
}

interface DraftGroupProps {
  readonly label: string | undefined;
  readonly onDrop: () => void;
  readonly children: ReactNode;
}

/** The draft's pickers, as a group named for the button that opened it. */
function DraftGroup({ label, onDrop, children }: DraftGroupProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={styles.firstStep}
      onKeyDown={(event) => {
        dropOnEscape(event, onDrop);
      }}
    >
      {children}
    </div>
  );
}

/**
 * Escape drops the draft and nothing more: Details' own Escape, which
 * closes it, would take the whole outline with it.
 */
function dropOnEscape(
  event: KeyboardEvent<HTMLElement>,
  onDrop: () => void,
): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  onDrop();
}

interface CallPickersProps {
  readonly start: NewCallStart;
  readonly chosen: Chosen;
  /** The component picker's `<select>`, which takes the focus. */
  readonly componentRef: RefObject<HTMLSelectElement | null>;
  readonly onChange: (chosen: Chosen) => void;
}

/**
 * The component picker, listing the caller's neighbours first, then the
 * rest, each of those marked as adding an edge; and once a component is
 * chosen, the action picker, listing what its type accepts.
 */
function CallPickers(props: CallPickersProps) {
  const { start, chosen, componentRef, onChange } = props;
  const choice = start.choices.find(
    (c) => c.componentId === chosen.componentId,
  );
  return (
    <>
      <Picker
        label="Component"
        selectRef={componentRef}
        prompt="Choose a component"
        value={choice?.componentId}
        options={start.choices.map(componentOption)}
        onPick={(componentId) => {
          onChange(chosenComponent(start.choices, componentId));
        }}
      />
      {choice !== undefined && (
        <ActionPicker
          choice={choice}
          action={chosen.action}
          onChange={onChange}
        />
      )}
    </>
  );
}

interface ActionPickerProps {
  readonly choice: CallChoice;
  readonly action: StepAction | undefined;
  readonly onChange: (chosen: Chosen) => void;
}

/** The actions the chosen component's type accepts. */
function ActionPicker({ choice, action, onChange }: ActionPickerProps) {
  return (
    <Picker
      label="Action"
      prompt="Choose an action"
      value={action}
      options={choice.actions.map((a) => ({ value: a, text: a }))}
      onPick={(value) => {
        const picked = choice.actions.find((a) => a === value);
        onChange({ componentId: choice.componentId, action: picked });
      }}
    />
  );
}

/** A component's option: its label, and the mark if choosing it adds an edge. */
function componentOption(choice: CallChoice): PickerOption {
  const { componentId, label, note } = choice;
  return { value: componentId, text: note ? `${label} · ${note}` : label };
}

/** What choosing a component sets: its action too, if its type accepts only one. */
function chosenComponent(
  choices: readonly CallChoice[],
  componentId: string,
): Chosen {
  const actions = choices.find((c) => c.componentId === componentId)?.actions;
  return {
    componentId,
    action: actions?.length === 1 ? actions[0] : undefined,
  };
}
