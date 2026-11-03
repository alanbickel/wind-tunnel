import { useCallback } from "react";
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
 * selection, or off what it took away, leaving the focus where it is.
 */
export function useUndoRedo(
  edits: ProjectEdits,
  selecting: ProjectSelection,
): UndoRedo {
  const [announcement, announce] = useAnnouncement();
  const follow = useFollowSelection(selecting);
  const after = { follow, announce };
  const undo = useHistoryAction({ step: edits.undo, verb: "Undid", ...after });
  const redo = useHistoryAction({ step: edits.redo, verb: "Redid", ...after });
  const { undoable, redoable } = edits.history;
  return {
    undo,
    redo,
    nextUndo: undoable.at(-1)?.description,
    nextRedo: redoable.at(-1)?.description,
    announcement,
  };
}

/** Moves the selection after an undo or a redo, as `selectionAfterUndo` says. */
function useFollowSelection(
  selecting: ProjectSelection,
): (move: HistoryMove) => void {
  const { selection, select, clear } = selecting;
  return useCallback(
    (move: HistoryMove) => {
      const change = selectionAfterUndo({
        from: move.from.project,
        to: move.to.project,
        selection,
      });
      dispatchKind(SELECTION_CHANGES, change)({ select, clear });
    },
    [selection, select, clear],
  );
}

/** An undo or a redo, and what follows it. */
interface HistoryActionInput {
  readonly step: HistoryStep;
  /** "Undid" or "Redid", as the announcement starts. */
  readonly verb: string;
  readonly follow: (move: HistoryMove) => void;
  readonly announce: (message: string) => void;
}

/** Takes the step, if there is one, then moves the selection and says so. */
function useHistoryAction(input: HistoryActionInput): () => void {
  const { step, verb, follow, announce } = input;
  return useCallback(() => {
    const move = step();
    if (move === undefined) return;
    follow(move);
    announce(`${verb}: ${inSentence(move.step.description)}.`);
  }, [step, verb, follow, announce]);
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
