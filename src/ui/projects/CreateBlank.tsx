import { useId, useState } from "react";
import type { ProjectSummary } from "../../application/ports/project-record";
import { Button } from "../shared/Button";
import styles from "./CreateBlank.module.css";
import { useCreateBlank, type BlankCreation } from "./useCreateBlank";

export interface CreateBlankProps {
  /** Called with the new project once it's saved, to open it. */
  readonly onCreated: (project: ProjectSummary) => void;
}

/**
 * A name field and "Create blank" (UX design §2.1 step 1). Enter in the
 * field does what the button does. A name that's empty, or that another
 * project uses, creates nothing: its message shows under the field, which
 * is marked `aria-invalid` and described by it, and is announced, since
 * the focus is already on the field or the button (UX design §4.4).
 */
export function CreateBlank({ onCreated }: CreateBlankProps) {
  const creating = useCreateBlank(onCreated);
  const messageId = useId();
  return (
    <div className={styles.blank}>
      <NameEntry creating={creating} messageId={messageId} />
      <Messages creating={creating} messageId={messageId} />
    </div>
  );
}

interface CreatingProps {
  readonly creating: BlankCreation;
  /** The id the name's message takes, while it has one. */
  readonly messageId: string;
}

/** The name field and "Create blank", side by side. */
function NameEntry({ creating, messageId }: CreatingProps) {
  const [text, setText] = useState("");
  const { create, message, clearMessage, pending } = creating;
  return (
    <div className={styles.entry}>
      <NameInput
        text={text}
        messageId={message === undefined ? undefined : messageId}
        onChange={(value) => {
          setText(value);
          clearMessage();
        }}
        onEnter={() => {
          create(text);
        }}
      />
      <Button
        usable={!pending}
        onClick={() => {
          create(text);
        }}
      >
        Create blank
      </Button>
    </div>
  );
}

interface NameInputProps {
  readonly text: string;
  /** The id of the name's message, while it has one. */
  readonly messageId: string | undefined;
  readonly onChange: (text: string) => void;
  readonly onEnter: () => void;
}

/** "Project name", labeled, and invalid while it has a message. */
function NameInput({ text, messageId, onChange, onEnter }: NameInputProps) {
  const inputId = useId();
  return (
    <>
      <label htmlFor={inputId} className={styles.label}>
        Project name
      </label>
      <input
        id={inputId}
        type="text"
        className={styles.name}
        value={text}
        aria-invalid={messageId !== undefined}
        aria-describedby={messageId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onEnter();
        }}
      />
    </>
  );
}

/**
 * The name's message, announced; that a create is running; and why one
 * failed, if not for its name.
 */
function Messages({ creating, messageId }: CreatingProps) {
  const { message, pending, problem } = creating;
  return (
    <>
      {message !== undefined && (
        <p id={messageId} role="alert" className={styles.message}>
          {message}
        </p>
      )}
      {pending && <p role="status">Creating the project…</p>}
      {problem && <p role="alert">{problem}</p>}
    </>
  );
}
