import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  NO_EDITS,
  recordEdit,
  redoEdit,
  undoEdit,
  type EditHistory,
  type HistoryMove,
} from "../../application/edits/edit-history";
import type { ProjectRecord } from "../../application/ports/project-record";
import { useUseCases } from "../app/useUseCases";
import { createSaveQueue, type SaveQueue } from "./save-queue";

/**
 * One change to a project: an edit command from `application/edits/`,
 * with its input filled in. It takes the record and returns the next one.
 */
export type EditCommand = (record: ProjectRecord) => ProjectRecord;

/** A command, and what it does in the screen's words: one undo step. */
export interface Edit {
  readonly command: EditCommand;
  /**
   * What the command did, as Undo and Redo name it: "Remove orders-db",
   * "Change orders-db's query workers". Given the record the command made,
   * for words that depend on it, such as an added component's name.
   */
  readonly describe: (after: ProjectRecord) => string;
}

/** An undo or a redo: what it did, if there was anything to do. */
export type HistoryStep = () => HistoryMove | undefined;

/** The record a project screen holds, and how it changes. */
export interface ProjectEdits {
  /** The project as the screen shows it, with every change made so far. */
  readonly record: ProjectRecord;
  /** The saved commands Undo and Redo move through. */
  readonly history: EditHistory;
  /** Applies a command to the record, shows the result, and saves it. */
  readonly edit: (edit: Edit) => void;
  /** Shows and saves the record before the last step; undefined if none. */
  readonly undo: HistoryStep;
  /** Shows and saves the record after the last undone step; undefined if none. */
  readonly redo: HistoryStep;
  /** True once the last change failed to save, until a save works. */
  readonly saveFailed: boolean;
  /** Saves the change that failed again. */
  readonly retry: () => void;
}

/** The loaded record, the record the screen holds since, and its history. */
interface HeldRecord {
  readonly loaded: ProjectRecord;
  readonly record: ProjectRecord;
  readonly history: EditHistory;
}

/**
 * Holds the opened project's record, applies each edit command to it, and
 * saves the result through `saveProject`, one save at a time (UX design
 * §4.3). The screen shows the record it holds at once, saved or not; if a
 * save fails, the change stays on screen and `saveFailed` says so. Each
 * command that changes the record is an undo step; Undo and Redo save the
 * record they go to through the same queue. A new `loaded` record, such as
 * the project opened again, replaces the record and starts a new history.
 */
export function useProjectEdits(loaded: ProjectRecord): ProjectEdits {
  const { current, latestRef, hold, saveFailed, retry } = useHeldRecord(loaded);
  const edit = useEdit({ latestRef, hold });
  const undo = useHistoryStep({ latestRef, hold, move: undoEdit });
  const redo = useHistoryStep({ latestRef, hold, move: redoEdit });
  const { record, history } = current;
  return { record, history, edit, undo, redo, saveFailed, retry };
}

/** The held record, the latest one, and how a change holds and saves the next. */
interface HeldRecordState {
  /** What this render shows. */
  readonly current: HeldRecord;
  /** The latest record, for a change made before React renders the last. */
  readonly latestRef: RefObject<HeldRecord>;
  /** Shows the next record at once, and saves it. */
  readonly hold: (next: HeldRecord) => void;
  readonly saveFailed: boolean;
  readonly retry: () => void;
}

/**
 * The record the screen holds, starting again from a new `loaded` one, and
 * a save queue that each change it holds goes through.
 */
function useHeldRecord(loaded: ProjectRecord): HeldRecordState {
  const [held, setHeld] = useState<HeldRecord>(() => opened(loaded));
  // Starting again from a new loaded record, during render, as React's
  // "adjusting state when a prop changes" pattern does.
  if (held.loaded !== loaded) setHeld(opened(loaded));
  const current = held.loaded === loaded ? held : opened(loaded);

  const latestRef = useRef(current);
  useLayoutEffect(() => {
    latestRef.current = current;
  }, [current]);

  const { queue, saveFailed } = useSaveQueue();
  const hold = useCallback(
    (next: HeldRecord) => {
      latestRef.current = next;
      setHeld(next);
      queue.save(next.record);
    },
    [queue],
  );
  return { current, latestRef, hold, saveFailed, retry: queue.retry };
}

/** A just-opened record, with nothing to undo. */
function opened(loaded: ProjectRecord): HeldRecord {
  return { loaded, record: loaded, history: NO_EDITS };
}

/** Where a change reads the latest record, and how it holds the next. */
type ChangeInput = Pick<HeldRecordState, "latestRef" | "hold">;

/** `edit`: a command that changes the record is held, saved, and a step. */
function useEdit({ latestRef, hold }: ChangeInput): ProjectEdits["edit"] {
  return useCallback(
    ({ command, describe }: Edit) => {
      const { loaded, record, history } = latestRef.current;
      const next = command(record);
      if (next === record) return;
      const step = { description: describe(next), before: record, after: next };
      hold({ loaded, record: next, history: recordEdit(history, step) });
    },
    [latestRef, hold],
  );
}

/** An undo or a redo, and the history move it makes. */
interface HistoryStepInput extends ChangeInput {
  /** `undoEdit` or `redoEdit`. */
  readonly move: (history: EditHistory) => HistoryMove | undefined;
}

/** An undo or a redo on the latest history, holding and saving where it goes. */
function useHistoryStep({
  latestRef,
  hold,
  move,
}: HistoryStepInput): HistoryStep {
  return useCallback(() => {
    const { loaded, history } = latestRef.current;
    const moved = move(history);
    if (moved === undefined) return undefined;
    hold({ loaded, record: moved.to, history: moved.history });
    return moved;
  }, [latestRef, hold, move]);
}

/** A screen's save queue, and whether its last save failed. */
interface SaveQueueState {
  readonly queue: SaveQueue;
  readonly saveFailed: boolean;
}

/**
 * One save queue for the screen's life, over `saveProject`. A save that
 * the use case refuses, or that throws, counts as failed.
 */
function useSaveQueue(): SaveQueueState {
  const { saveProject } = useUseCases();
  const [saveFailed, setSaveFailed] = useState(false);
  const [queue] = useState<SaveQueue>(() =>
    createSaveQueue({
      save: (record) =>
        saveProject.execute(record).then(
          (result) => result.status === "saved",
          () => false,
        ),
      onFailedChange: setSaveFailed,
    }),
  );
  return { queue, saveFailed };
}
