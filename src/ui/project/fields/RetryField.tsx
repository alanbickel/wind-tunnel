import { useId } from "react";
import type { RetryFieldDescriptor } from "../../../application/details/field-descriptor";
import {
  BACKOFF_CHOICES,
  checkRetryDraft,
  presetNote,
  RETRY_MODE_CHOICES,
  RETRY_PARTS,
  retryDraft,
  withBackoff,
  withMode,
  withPartText,
  type RetryDraft,
  type RetryPart,
} from "../../../application/details/retry-draft";
import type { ResolvedRetryPolicy } from "../../../domain/engine/resolve-retry";
import { sameContent } from "../../../application/run-analysis/same-content";
import { fieldKeys, type FieldKeysInput, type FieldProps } from "./field-parts";
import styles from "./Fields.module.css";
import { TextField } from "./TextField";
import { useDraft, type Draft } from "./useDraft";

export interface RetryFieldProps extends FieldProps {
  readonly field: RetryFieldDescriptor;
  /** As stored: a custom `RetryPolicy` or the AWS SDK standard preset. */
  readonly value: unknown;
  /** The id of the setting's help, which also describes the group. */
  readonly helpId: string;
}

/**
 * An edge's retries: a mode (AWS SDK standard or custom), attempts, a
 * backoff picker, and a base delay in ms. On the preset, the numbers show
 * what it resolves to on this edge; new attempts keep the preset, and a
 * new backoff or delay makes it custom (ADR-0025 decision 3.4). The draft
 * is the whole value: it saves when a field or a picker is left, or on
 * Enter, if both numbers pass. As with a distribution's kind, a picker
 * isn't saved on each change, because arrow keys on a closed picker
 * change it once for each option they pass.
 */
export function RetryField(props: RetryFieldProps) {
  const { field, helpId } = props;
  const { sdkStandard } = field;
  const state = useRetryDraft(props);
  const noteId = useId();
  const isPreset = state.draft.value.mode !== "custom";
  const [attempts, delay] = RETRY_PARTS.map((part) => (
    <PartField key={part.key} state={state} part={part} />
  ));
  return (
    <fieldset
      className={styles.group}
      aria-describedby={isPreset ? `${helpId} ${noteId}` : helpId}
    >
      <legend className={styles.label}>{field.label}</legend>
      <ModePicker state={state} sdkStandard={sdkStandard} />
      {attempts}
      <BackoffPicker state={state} />
      {delay}
      {isPreset ? (
        <p id={noteId} className={styles.help}>
          {presetNote(sdkStandard)}
        </p>
      ) : null}
    </fieldset>
  );
}

interface ModePickerProps {
  readonly state: RetryDraftState;
  /** What the preset resolves to on the edge, which picking it shows. */
  readonly sdkStandard: ResolvedRetryPolicy;
}

/** AWS SDK standard, or custom. */
function ModePicker({ state, sdkStandard }: ModePickerProps) {
  const { draft } = state;
  return (
    <Picker
      label="Mode"
      value={draft.value.mode}
      choices={RETRY_MODE_CHOICES}
      onPick={(mode) => {
        draft.set(withMode(draft.value, { mode, sdkStandard }));
      }}
      keys={keysOf(state)}
    />
  );
}

interface BackoffPickerProps {
  readonly state: RetryDraftState;
}

/** How the wait between attempts grows; a new one makes the preset custom. */
function BackoffPicker({ state }: BackoffPickerProps) {
  const { draft, edit } = state;
  return (
    <Picker
      label="Backoff"
      value={draft.value.backoff}
      choices={BACKOFF_CHOICES}
      onPick={(backoff) => {
        edit(withBackoff(draft.value, backoff));
      }}
      keys={keysOf(state)}
    />
  );
}

interface PartFieldProps {
  readonly state: RetryDraftState;
  readonly part: RetryPart;
}

/** One of the retries' numbers: their attempts, or their base delay. */
function PartField({ state, part }: PartFieldProps) {
  return (
    <TextField
      label={part.label}
      unit={part.unit}
      inputMode={part.rule.wholeNumber ? "numeric" : "decimal"}
      draft={partDraft(state, part)}
      message={state.messages[part.key]}
      onCommit={state.commit}
    />
  );
}

/** What a picker's keys do: commit on Enter, and put back the saved value on Escape. */
function keysOf({ draft, commit }: RetryDraftState): FieldKeysInput {
  return { commit, changed: draft.changed, reset: draft.reset };
}

/** One option of a picker: its stored value, and how it reads. */
interface PickerChoice<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface PickerProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly choices: readonly PickerChoice<T>[];
  readonly onPick: (value: T) => void;
  /** Commits on Enter and on leaving the picker; Escape puts back the saved value. */
  readonly keys: FieldKeysInput;
}

/** A picker within the retries: their mode, or how the wait grows. */
function Picker<T extends string>(props: PickerProps<T>) {
  const { label, value, choices, onPick, keys } = props;
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const picked = choices.find(
            (choice) => choice.value === event.target.value,
          );
          if (picked) onPick(picked.value);
        }}
        onBlur={keys.commit}
        onKeyDown={fieldKeys(keys)}
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A retry field's draft, its messages, and what commits it. */
interface RetryDraftState {
  readonly draft: Draft<RetryDraft>;
  /** Each failing number's message, by its key. */
  readonly messages: Readonly<Partial<Record<RetryPart["key"], string>>>;
  /** Saves the draft if it passes; announces what's wrong if not. */
  readonly commit: () => void;
  /**
   * Sets a backoff or number edit, announcing it if it leaves the preset,
   * since nothing else tells a screen-reader user that Mode changed.
   */
  readonly edit: (next: RetryDraft) => void;
}

/** Said when a new backoff or base delay turns the preset custom. */
const LEFT_PRESET =
  "Mode is now Custom, with one base delay for both kinds of error.";

function useRetryDraft(props: RetryFieldProps): RetryDraftState {
  const { field, value, save, announce } = props;
  const { sdkStandard } = field;
  const draft = useDraft(retryDraft(value, sdkStandard));
  const check = checkRetryDraft(draft.value, sdkStandard);
  const edit = (next: RetryDraft) => {
    if (draft.value.mode !== "custom" && next.mode === "custom") {
      announce(LEFT_PRESET);
    }
    draft.set(next);
  };
  const commit = () => {
    if (check.status === "fails") {
      announce(Object.values(check.messages).join(" "));
      return;
    }
    if (sameContent(check.value, value)) return;
    save(check.value);
  };
  const messages = check.status === "fails" ? check.messages : {};
  return { draft, messages, commit, edit };
}

/** One number's text, as a draft of its own over the retries'. */
function partDraft(
  { draft, edit }: RetryDraftState,
  part: RetryPart,
): Draft<string> {
  const { value } = draft;
  return {
    value: value.texts[part.key],
    set: (text) => {
      edit(withPartText(value, { key: part.key, text }));
    },
    reset: draft.reset,
    changed: draft.changed,
  };
}
