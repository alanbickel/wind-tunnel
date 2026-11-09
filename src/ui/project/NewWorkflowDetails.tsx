import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { Selection } from "../../application/details/selection";
import { checkWorkflowName } from "../../application/details/workflow-name";
import { addWorkflow } from "../../application/edits/workflow-edits";
import type {
  FirstStepChoice,
  NewWorkflowStart,
} from "../../application/use-cases/new-workflow";
import type { Project, StepAction } from "../../domain/model/project";
import { useUseCases } from "../app/useUseCases";
import fieldStyles from "./fields/Fields.module.css";
import { TextField } from "./fields/TextField";
import { useDraft, type Draft } from "./fields/useDraft";
import styles from "./SelectionDetails.module.css";
import type { Edit } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";

export interface NewWorkflowDetailsProps {
  readonly project: Project;
  /** Saves the workflow, once its first step is complete. */
  readonly onEdit: (edit: Edit) => void;
  /** Selects the saved workflow. */
  readonly onSelect: (selection: Selection) => void;
  /** Whether the name field takes the focus: just after "Add workflow". */
  readonly takeFocus: ProjectSelection["takeFocus"];
}

/**
 * A new workflow, as a draft in Details (UX design §2.5 steps 1 and 2): a
 * name field, holding the first free name, selected, and an empty first
 * step with a component picker and an action picker. Nothing is saved
 * until the name passes its check and the step has a component and an
 * action: then the workflow is added, as one undo step, and selected. The
 * draft lives only here, so selecting anything else, or Escape, drops it.
 */
export function NewWorkflowDetails(props: NewWorkflowDetailsProps) {
  const { newWorkflow } = useUseCases();
  // Read once: the ids and the free name belong to this draft.
  const [start] = useState(() =>
    newWorkflow.execute({ project: props.project }),
  );
  return <WorkflowDraft {...props} start={start} />;
}

/** A chosen component, and its action once there is one. */
interface FirstStep {
  readonly componentId: string | undefined;
  readonly action: StepAction | undefined;
}

const EMPTY_STEP: FirstStep = { componentId: undefined, action: undefined };

interface WorkflowDraftProps extends NewWorkflowDetailsProps {
  readonly start: NewWorkflowStart;
}

/** The draft's heading, name, and first step. */
function WorkflowDraft(props: WorkflowDraftProps) {
  const { start } = props;
  const name = useDraft(start.name);
  const [step, setStep] = useState(EMPTY_STEP);
  const { save, closedRef } = useSaveWhenComplete({ ...props, name });
  return (
    <div
      onKeyDown={(event) => {
        markClosedOnEscape(event, closedRef);
      }}
    >
      <DraftHeading />
      <NameField
        {...props}
        draft={name}
        onCommit={() => {
          save(step);
        }}
      />
      <FirstStepPickers
        choices={start.components}
        step={step}
        onChange={(next) => {
          setStep(next);
          save(next);
        }}
      />
    </div>
  );
}

/** What the draft is called, until it has a name of its own. */
function DraftHeading() {
  return (
    <div className={styles.header}>
      <h4 className={styles.heading}>New workflow</h4>
    </div>
  );
}

/**
 * Escape, which the screen answers by dropping the draft, marks it closed
 * first. It doesn't stop the key: Details closes on it. A field with
 * something to put back stops it before it gets here.
 */
function markClosedOnEscape(
  event: KeyboardEvent<HTMLElement>,
  closedRef: RefObject<boolean>,
): void {
  if (event.key === "Escape") closedRef.current = true;
}

interface SaveWhenCompleteInput extends WorkflowDraftProps {
  /** The name's draft. */
  readonly name: Draft<string>;
}

interface SaveWhenComplete {
  /** Saves and selects the workflow if the name passes and the step is complete. */
  readonly save: (step: FirstStep) => void;
  /**
   * Set once the draft has saved or been dropped. Removing the focused
   * name field fires `blur` in a browser, and its handler would save the
   * draft again, or save one that Escape meant to drop.
   */
  readonly closedRef: RefObject<boolean>;
}

function useSaveWhenComplete(input: SaveWhenCompleteInput): SaveWhenComplete {
  const { project, start, name, onEdit, onSelect } = input;
  const closedRef = useRef(false);
  const save = ({ componentId, action }: FirstStep) => {
    const check = checkWorkflowName({
      project,
      workflowId: start.workflowId,
      text: name.value,
    });
    if (closedRef.current || check.status === "fails") return;
    if (componentId === undefined || action === undefined) return;
    closedRef.current = true;
    const { workflowId, rootStepId } = start;
    const text = check.value;
    onEdit({
      command: (record) =>
        addWorkflow(record, {
          workflowId,
          rootStepId,
          name: text,
          componentId,
          action,
        }),
      describe: () => `Add workflow ${text}`,
    });
    onSelect({ kind: "workflow", workflowId });
  };
  return { save, closedRef };
}

interface NameFieldProps extends WorkflowDraftProps {
  readonly draft: Draft<string>;
  readonly onCommit: () => void;
}

/** The name, checked on each render, taking the focus with its text selected. */
function NameField(props: NameFieldProps) {
  const { project, start, draft, takeFocus, onCommit } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  // A layout effect, as a new component's name field takes the focus.
  useLayoutEffect(() => {
    if (!takeFocus("name")) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [takeFocus]);
  const check = checkWorkflowName({
    project,
    workflowId: start.workflowId,
    text: draft.value,
  });
  return (
    <TextField
      label="Name"
      inputRef={inputRef}
      draft={draft}
      message={check.status === "fails" ? check.message : undefined}
      onCommit={onCommit}
    />
  );
}

interface FirstStepPickersProps {
  readonly choices: readonly FirstStepChoice[];
  readonly step: FirstStep;
  readonly onChange: (step: FirstStep) => void;
}

/**
 * The first step's component picker, listing every component, and under
 * it its action picker, listing what the component's type accepts: chosen
 * already when there's only one.
 */
function FirstStepPickers({ choices, step, onChange }: FirstStepPickersProps) {
  const chosen = choices.find((c) => c.componentId === step.componentId);
  return (
    <div className={styles.firstStep}>
      <Picker
        label="Component"
        prompt="Choose a component"
        value={step.componentId}
        options={choices.map((c) => ({ value: c.componentId, text: c.label }))}
        onPick={(componentId) => {
          onChange(stepOfComponent(choices, componentId));
        }}
      />
      {chosen !== undefined && (
        <Picker
          label="Action"
          prompt="Choose an action"
          value={step.action}
          options={chosen.actions.map((a) => ({ value: a, text: a }))}
          onPick={(action) => {
            onChange({
              componentId: chosen.componentId,
              action: chosen.actions.find((a) => a === action),
            });
          }}
        />
      )}
    </div>
  );
}

/** The step a chosen component makes: its action chosen if it accepts only one. */
function stepOfComponent(
  choices: readonly FirstStepChoice[],
  componentId: string,
): FirstStep {
  const actions = choices.find((c) => c.componentId === componentId)?.actions;
  return {
    componentId,
    action: actions?.length === 1 ? actions[0] : undefined,
  };
}

/** One choice of a picker: what it sets, and what it's called. */
interface PickerOption {
  readonly value: string;
  readonly text: string;
}

interface PickerProps {
  readonly label: string;
  /** The option shown while nothing is chosen. */
  readonly prompt: string;
  readonly value: string | undefined;
  readonly options: readonly PickerOption[];
  readonly onPick: (value: string) => void;
}

/** A labeled picker, empty until something is chosen. */
function Picker({ label, prompt, value, options, onPick }: PickerProps) {
  const id = useId();
  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => {
          onPick(event.target.value);
        }}
      >
        <option value="" disabled>
          {prompt}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
      </select>
    </div>
  );
}
