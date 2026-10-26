import type { KeyboardEvent } from "react";
import type { EditCommand } from "../useProjectEdits";

/** What every field of a component's settings is given. */
export interface FieldProps {
  readonly componentId: string;
  /** Saves a command: the field's draft, once it passes. */
  readonly onEdit: (command: EditCommand) => void;
  /** Says a message politely, without moving the focus. */
  readonly announce: (message: string) => void;
}

/** What a field's keys do: Enter commits, Escape puts the saved value back. */
export interface FieldKeysInput {
  readonly commit: () => void;
  /** Whether there's a draft to put back; if not, Escape goes on to close Details. */
  readonly changed: boolean;
  readonly reset: () => void;
}

type KeyHandler = (event: KeyboardEvent<HTMLElement>) => void;

/** The key handler for a field's input. */
export function fieldKeys({
  commit,
  changed,
  reset,
}: FieldKeysInput): KeyHandler {
  return (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key !== "Escape" || !changed) return;
    event.preventDefault();
    event.stopPropagation();
    reset();
  };
}

/** A field's message, and what else describes it. */
export interface DescribedByInput {
  readonly messageId: string;
  /** Undefined while the draft passes, when there's no message to point at. */
  readonly message: string | undefined;
  /** What else describes the field, in order: its unit, its help, its default. */
  readonly otherIds: readonly (string | undefined)[];
}

/** The ids a field's `aria-describedby` lists: its message first, if it has one. */
export function describedBy({
  messageId,
  message,
  otherIds,
}: DescribedByInput): string | undefined {
  const ids = [message === undefined ? undefined : messageId, ...otherIds];
  const listed = ids.filter((id) => id !== undefined);
  return listed.length === 0 ? undefined : listed.join(" ");
}
