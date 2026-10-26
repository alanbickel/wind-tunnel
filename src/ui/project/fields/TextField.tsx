import { useId } from "react";
import { describedBy, fieldKeys } from "./field-parts";
import styles from "./Fields.module.css";
import type { Draft } from "./useDraft";

export interface TextFieldProps {
  readonly label: string;
  /** Shown after the input, e.g. "queries". */
  readonly unit?: string | undefined;
  /** The keyboard a phone shows; text unless given. */
  readonly inputMode?: "numeric" | "decimal";
  readonly draft: Draft<string>;
  /** What's wrong with the draft; undefined while it passes. */
  readonly message: string | undefined;
  /** On Enter, and on leaving the field. */
  readonly onCommit: () => void;
  /** The id of what else describes the field, such as its help. */
  readonly helpId?: string;
}

/**
 * One labeled input holding a draft, with its unit after it and its message
 * under it. The input is marked `aria-invalid` while the draft fails, and
 * its `aria-describedby` points at the message first, then the unit and the
 * help, so a screen reader reads each with the field (UX design §4.4).
 */
export function TextField(props: TextFieldProps) {
  const { label, unit, message, helpId } = props;
  const inputId = useId();
  const messageId = useId();
  const unitId = useId();
  const otherIds = [unit === undefined ? undefined : unitId, helpId];
  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <span className={styles.entry}>
        <DraftInput
          {...props}
          id={inputId}
          describedBy={describedBy({ messageId, message, otherIds })}
        />
        {unit !== undefined && <span id={unitId}>{unit}</span>}
      </span>
      {message !== undefined && (
        <p id={messageId} className={styles.message}>
          {message}
        </p>
      )}
    </div>
  );
}

interface DraftInputProps extends TextFieldProps {
  readonly id: string;
  readonly describedBy: string | undefined;
}

/** The input: shows the draft, and commits it on Enter or on leaving. */
function DraftInput(props: DraftInputProps) {
  const { id, inputMode, draft, message, onCommit, describedBy: ids } = props;
  return (
    <input
      id={id}
      type="text"
      inputMode={inputMode}
      className={inputMode === undefined ? styles.text : styles.number}
      value={draft.value}
      aria-invalid={message !== undefined}
      aria-describedby={ids}
      onChange={(event) => {
        draft.set(event.target.value);
      }}
      onBlur={onCommit}
      onKeyDown={fieldKeys({
        commit: onCommit,
        changed: draft.changed,
        reset: draft.reset,
      })}
    />
  );
}
