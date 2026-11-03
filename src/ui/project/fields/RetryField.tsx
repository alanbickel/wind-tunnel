import { useId } from "react";
import type { RetryFieldDescriptor } from "../../../application/details/field-descriptor";
import {
  BACKOFF_CHOICES,
  checkRetryDraft,
  RETRY_PARTS,
  retryDraft,
  type RetryDraft,
  type RetryPart,
} from "../../../application/details/retry-draft";
import { sameContent } from "../../../application/run-analysis/same-content";
import type { BackoffStrategy } from "../../../domain/model/project";
import { fieldKeys, type FieldKeysInput, type FieldProps } from "./field-parts";
import styles from "./Fields.module.css";
import { TextField } from "./TextField";
import { useDraft, type Draft } from "./useDraft";

export interface RetryFieldProps extends FieldProps {
  readonly field: RetryFieldDescriptor;
  /** As stored: a `RetryPolicy`. */
  readonly value: unknown;
  /** The id of the setting's help, which also describes the group. */
  readonly helpId: string;
}

/**
 * An edge's retry policy: attempts, a backoff picker, and a base delay in
 * ms. The draft is the whole policy: it saves when a field or the picker
 * is left, or on Enter, if both numbers pass. As with a distribution's
 * kind, the backoff isn't saved on each change, because arrow keys on a
 * closed picker change it once for each backoff they pass.
 */
export function RetryField(props: RetryFieldProps) {
  const { field, helpId } = props;
  const { draft, messages, commit } = useRetryDraft(props);
  const keys = { commit, changed: draft.changed, reset: draft.reset };
  const [attempts, delay] = RETRY_PARTS.map((part) => (
    <TextField
      key={part.key}
      label={part.label}
      unit={part.unit}
      inputMode={part.rule.wholeNumber ? "numeric" : "decimal"}
      draft={partDraft(draft, part)}
      message={messages[part.key]}
      onCommit={commit}
    />
  ));
  return (
    <fieldset className={styles.group} aria-describedby={helpId}>
      <legend className={styles.label}>{field.label}</legend>
      {attempts}
      <BackoffPicker
        backoff={draft.value.backoff}
        onPick={(backoff) => {
          draft.set({ ...draft.value, backoff });
        }}
        keys={keys}
      />
      {delay}
    </fieldset>
  );
}

interface BackoffPickerProps {
  readonly backoff: BackoffStrategy;
  readonly onPick: (backoff: BackoffStrategy) => void;
  /** Commits on Enter and on leaving the picker; Escape puts back the saved policy. */
  readonly keys: FieldKeysInput;
}

/** How the wait between attempts grows. */
function BackoffPicker({ backoff, onPick, keys }: BackoffPickerProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        Backoff
      </label>
      <select
        id={id}
        value={backoff}
        onChange={(event) => {
          const picked = BACKOFF_CHOICES.find(
            (choice) => choice.value === event.target.value,
          );
          if (picked) onPick(picked.value);
        }}
        onBlur={keys.commit}
        onKeyDown={fieldKeys(keys)}
      >
        {BACKOFF_CHOICES.map((choice) => (
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
}

function useRetryDraft(props: RetryFieldProps): RetryDraftState {
  const { value, save, announce } = props;
  const draft = useDraft(retryDraft(value));
  const check = checkRetryDraft(draft.value);
  const commit = () => {
    if (check.status === "fails") {
      announce(Object.values(check.messages).join(" "));
      return;
    }
    if (sameContent(check.value, value)) return;
    save(check.value);
  };
  const messages = check.status === "fails" ? check.messages : {};
  return { draft, messages, commit };
}

/** One number's text, as a draft of its own over the policy's. */
function partDraft(draft: Draft<RetryDraft>, part: RetryPart): Draft<string> {
  const { value } = draft;
  return {
    value: value.texts[part.key],
    set: (text) => {
      draft.set({ ...value, texts: { ...value.texts, [part.key]: text } });
    },
    reset: draft.reset,
    changed: draft.changed,
  };
}
