import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { OutlineStep } from "../../application/details/details";
import type { Project, StepAction } from "../../domain/model/project";
import type { CallChoice } from "../../application/use-cases/call-choices";
import type { NewCallStart } from "../../application/use-cases/new-call";
import { noEdgesNote } from "../../application/details/add-call-text";
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
  /** The step that gets the call: its `addCallLabel` is set, or it's an `enqueue` with an empty slot. */
  readonly step: OutlineStep;
  /** The words of the button, and the name of the draft it opens. */
  readonly label: string;
  /** Saves the call, selects it, and announces it. */
  readonly onAdd: (call: AddedCall) => void;
}

/**
 * "Add a call from api", under a step's calls (UX design §2.5 steps 3 and
 * 5), or "Add async work …" in an `enqueue` step's empty slot (§2.5 step 8):
 * it opens a draft call, a component picker and an action picker, which
 * lives only here, so nothing is saved until both are chosen, and Escape
 * drops it and returns the focus to the button. The button is off the page
 * while the draft is open.
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
          label={`${props.label}, step ${step.number}`}
          onClick={ask}
        >
          {props.label}
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

/** The draft: its two pickers, or, with no edge to call along, what to do. */
function CallDraft(props: CallDraftProps) {
  const { project, workflowId, step, onDrop } = props;
  const { newCall } = useUseCases();
  // Read again with the project: an Undo can change the components while
  // the draft is open, and a call must go to one that is there.
  const start = useMemo(
    () => newCall.execute({ project, workflowId, stepId: step.stepId }),
    [newCall, project, workflowId, step.stepId],
  );
  if (start === undefined) return null;
  if (start.choices.length > 0) return <PickerDraft {...props} start={start} />;
  return (
    <NoEdgesDraft
      label={props.label}
      callerName={start.callerName}
      onDrop={onDrop}
    />
  );
}

interface PickerDraftProps extends CallDraftProps {
  readonly start: NewCallStart;
}

/**
 * The draft's two pickers. The call saves once both are chosen: a
 * component whose type accepts one action has it chosen already.
 */
function PickerDraft(props: PickerDraftProps) {
  const { start, step, onAdd, onDrop, onSaved } = props;
  const [chosen, setChosen] = useState(NOTHING_CHOSEN);
  // The button that opened the draft is gone, so the focus moves to the
  // component picker; Escape works from there.
  const componentRef = useFocusOnMount<HTMLSelectElement>();
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
    <DraftGroup label={props.label} onDrop={onDrop}>
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
  /** Set when there is no picker to take the focus: the group takes it. */
  readonly groupRef?: RefObject<HTMLDivElement | null>;
  /** The id of a note that describes the group, which a screen reader reads on focus. */
  readonly noteId?: string;
  readonly children: ReactNode;
}

/** The draft's pickers, as a group named for the button that opened it. */
function DraftGroup(props: DraftGroupProps) {
  const { label, onDrop, groupRef, noteId, children } = props;
  return (
    <div
      ref={groupRef}
      tabIndex={groupRef === undefined ? undefined : -1}
      role="group"
      aria-label={label}
      aria-describedby={noteId}
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
 * The component picker, listing the components the caller has an edge to;
 * and once a component is chosen, the action picker, listing what its type
 * accepts.
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

/** A component's option: its label. */
function componentOption({ componentId, label }: CallChoice): PickerOption {
  return { value: componentId, text: label };
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

interface NoEdgesDraftProps {
  readonly label: string | undefined;
  readonly callerName: string;
  readonly onDrop: () => void;
}

/**
 * What the draft shows when the caller has no edge to call along: a call
 * never adds one, so the words say how to make one. With no picker to take
 * the focus, the group does (so Escape works), and the note describes it
 * (so a screen reader reads it when the draft opens).
 */
function NoEdgesDraft({ label, callerName, onDrop }: NoEdgesDraftProps) {
  const groupRef = useFocusOnMount<HTMLDivElement>();
  const noteId = useId();
  return (
    <DraftGroup
      label={label}
      onDrop={onDrop}
      groupRef={groupRef}
      noteId={noteId}
    >
      <p id={noteId} className={styles.empty}>
        {noEdgesNote(callerName)}
      </p>
    </DraftGroup>
  );
}
