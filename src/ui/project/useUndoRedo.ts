import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  selectionAfterUndo,
  type SelectionChange,
} from "../../application/details/selection-after-undo";
import type { HistoryMove } from "../../application/edits/edit-history";
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import { dispatchKind } from "../shared/kind-dispatch";
import { inSentence } from "../shared/in-sentence";
import { useAnnouncement } from "../shared/useAnnouncement";
import type { HistoryStep, ProjectEdits } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";

/** Undo and Redo, what each would do, and what the last one did. */
export interface UndoRedo {
  readonly undo: () => void;
  readonly redo: () => void;
  /** For the Undo and Redo buttons' `ref`, so one can take the focus. */
  readonly undoButton: RefObject<HTMLButtonElement | null>;
  readonly redoButton: RefObject<HTMLButtonElement | null>;
  /** What Undo would take back, e.g. "Remove orders-db"; undefined if nothing. */
  readonly nextUndo: string | undefined;
  /** What Redo would do again; undefined if nothing. */
  readonly nextRedo: string | undefined;
  /** "Undid: remove orders-db.", for the polite region beside the buttons. */
  readonly announcement: string;
}

/**
 * Undo and Redo on the screen's edits (UX design §4.3, §4.4): each saves
 * the record it goes to, says what it did, since the change can be
 * anywhere on the screen, and moves the selection as `selectionAfterUndo`
 * says: to what it brought back, whose Details take the focus as after any
 * selection, or off what it took away, leaving the focus where it is unless
 * what took it went too, when it moves to the button just used.
 */
export function useUndoRedo(
  edits: ProjectEdits,
  selecting: ProjectSelection,
): UndoRedo {
  const [announcement, announce] = useAnnouncement();
  const follow = useFollowSelection(selecting);
  const after = { follow, announce, keepFocusAt: useFocusKeeper() };
  const [undo, undoButton] = useHistoryAction({
    step: edits.undo,
    verb: "Undid",
    ...after,
  });
  const [redo, redoButton] = useHistoryAction({
    step: edits.redo,
    verb: "Redid",
    ...after,
  });
  const { undoable, redoable } = edits.history;
  return {
    undo,
    redo,
    undoButton,
    redoButton,
    nextUndo: undoable.at(-1)?.description,
    nextRedo: redoable.at(-1)?.description,
    announcement,
  };
}

/** The button to put the focus on if the screen's change takes it away. */
type FocusTarget = RefObject<HTMLButtonElement | null>;

/**
 * Returns a function that asks for the focus to go to a button, if, once the
 * screen has changed, nothing has it: the element that had it is gone and
 * the focus has fallen to the page. Where the focus still is, it stays.
 */
function useFocusKeeper(): (target: FocusTarget) => void {
  const pending = useRef<FocusTarget | undefined>(undefined);
  useEffect(() => {
    const target = pending.current;
    if (target === undefined) return;
    pending.current = undefined;
    const { activeElement } = document;
    if (activeElement === null || activeElement === document.body) {
      target.current?.focus();
    }
  });
  return useCallback((target: FocusTarget) => {
    pending.current = target;
  }, []);
}

/** Moves the selection after an undo or a redo, as `selectionAfterUndo` says. */
function useFollowSelection(
  selecting: ProjectSelection,
): (move: HistoryMove) => SelectionChange {
  const { selection, select, clear } = selecting;
  return useCallback(
    (move: HistoryMove) => {
      const change = selectionAfterUndo({
        from: move.from.project,
        to: move.to.project,
        selection,
      });
      dispatchKind(SELECTION_CHANGES, change)({ select, clear });
      return change;
    },
    [selection, select, clear],
  );
}

/** An undo or a redo, and what follows it. */
interface HistoryActionInput {
  readonly step: HistoryStep;
  /** "Undid" or "Redid", as the announcement starts. */
  readonly verb: string;
  readonly follow: (move: HistoryMove) => SelectionChange;
  readonly announce: (message: string) => void;
  readonly keepFocusAt: (target: FocusTarget) => void;
}

/**
 * Takes the step, if there is one, then moves the selection and says so. If
 * that clears the selection, the focus may have been on what went, so it
 * goes to the button just used, where the keyboard user already is. Returns
 * the action and the ref its button takes.
 */
function useHistoryAction(
  input: HistoryActionInput,
): [() => void, FocusTarget] {
  const { step, verb, follow, announce, keepFocusAt } = input;
  const button = useRef<HTMLButtonElement>(null);
  const action = useCallback(() => {
    const move = step();
    if (move === undefined) return;
    if (follow(move).kind === "clear") keepFocusAt(button);
    announce(`${verb}: ${inSentence(move.step.description)}.`);
  }, [step, verb, follow, announce, keepFocusAt]);
  return [action, button];
}

/** What changing the selection uses. */
type Selecting = Pick<ProjectSelection, "select" | "clear">;

const SELECTION_CHANGES: KindHandlers<
  SelectionChange,
  (selecting: Selecting) => void
> = {
  select:
    ({ selection }) =>
    ({ select }) => {
      select(selection);
    },
  clear:
    () =>
    ({ clear }) => {
      clear();
    },
  keep: () => () => undefined,
};
