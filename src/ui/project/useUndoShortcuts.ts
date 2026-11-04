import { useEffect } from "react";
import type { UndoRedo } from "./useUndoRedo";

/** Which of Undo and Redo a shortcut runs. */
type HistoryAction = keyof Pick<UndoRedo, "undo" | "redo">;

/** Each shortcut, as `shortcutOf` writes it: Ctrl or Cmd with the key. */
const SHORTCUTS: Readonly<Record<string, HistoryAction>> = {
  z: "undo",
  "shift+z": "redo",
  y: "redo",
};

/**
 * Ctrl+Z undoes; Ctrl+Shift+Z and Ctrl+Y redo; Cmd instead of Ctrl, as on
 * a Mac (UX design §4.3). Listens on the window, so they work wherever
 * the focus is, except in a field that can hold a draft: a text field,
 * whose own undo works on the draft, or a picker.
 */
export function useUndoShortcuts({ undo, redo }: UndoRedo): void {
  useEffect(() => {
    const actions: Record<HistoryAction, () => void> = { undo, redo };
    const onKeyDown = (event: KeyboardEvent) => {
      const action = shortcutAction(event);
      if (action === undefined || isDraftField(event.target)) return;
      event.preventDefault();
      actions[action]();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [undo, redo]);
}

/** The action the key press is a shortcut for, if any. */
function shortcutAction(event: KeyboardEvent): HistoryAction | undefined {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return undefined;
  const shift = event.shiftKey ? "shift+" : "";
  return SHORTCUTS[`${shift}${event.key.toLowerCase()}`];
}

/** Whether the element is a field that can hold a draft. */
function isDraftField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, textarea, select") || target.isContentEditable;
}
