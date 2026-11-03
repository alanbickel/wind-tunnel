import type { ProjectRecord } from "../ports/project-record";

// The edit history (ADR-0019 decision 5, UX design §4.3): a plain value,
// held by the project screen while the project is open and never stored.
// Each saved command is one step, with the records before and after it, so
// undoing a remove brings back everything it took.

/** One saved command: what it did, and the records either side of it. */
export interface EditStep {
  /** What the command did, in the screen's words, e.g. "Remove orders-db". */
  readonly description: string;
  readonly before: ProjectRecord;
  readonly after: ProjectRecord;
}

/** The steps that can be undone, and those an undo can bring back. */
export interface EditHistory {
  /** Oldest first; the last is the next to undo. */
  readonly undoable: readonly EditStep[];
  /** Oldest undo last; the last is the next to redo. */
  readonly redoable: readonly EditStep[];
}

/** A history with nothing to undo or redo, as a project opens with. */
export const NO_EDITS: EditHistory = { undoable: [], redoable: [] };

/** An undo or a redo: the history after it, the step, and the records either side. */
export interface HistoryMove {
  readonly history: EditHistory;
  readonly step: EditStep;
  /** The record the move leaves: the step's after for an undo, before for a redo. */
  readonly from: ProjectRecord;
  /** The record the move goes to: the step's before for an undo, after for a redo. */
  readonly to: ProjectRecord;
}

/** Adds a saved command's step. What could be redone is dropped. */
export function recordEdit(history: EditHistory, step: EditStep): EditHistory {
  return { undoable: [...history.undoable, step], redoable: [] };
}

/** Undoes the last step, or returns undefined if there's none. */
export function undoEdit(history: EditHistory): HistoryMove | undefined {
  const step = history.undoable.at(-1);
  if (step === undefined) return undefined;
  return {
    history: {
      undoable: history.undoable.slice(0, -1),
      redoable: [...history.redoable, step],
    },
    step,
    from: step.after,
    to: step.before,
  };
}

/** Redoes the last step undone, or returns undefined if there's none. */
export function redoEdit(history: EditHistory): HistoryMove | undefined {
  const step = history.redoable.at(-1);
  if (step === undefined) return undefined;
  return {
    history: {
      undoable: [...history.undoable, step],
      redoable: history.redoable.slice(0, -1),
    },
    step,
    from: step.before,
    to: step.after,
  };
}
