import { useCallback, useReducer, useRef } from "react";
import type { Selection } from "../../application/details/selection";
import type { FindingKey } from "../../application/run-analysis/findings/finding";
import {
  INITIAL_SCREEN_STATE,
  nextScreenState,
  type DockState,
  type OverlayKey,
  type ScreenState,
  type ScreenTransition,
} from "./screen/screen-state";

/**
 * What in Details takes the focus after a selection: its heading, or a new
 * component's name field, so the user can name it at once (UX §2.1 step 2).
 * "none" asks for nothing, for a selection that places the focus itself:
 * a step's remove moves it to the step's caller in the outline.
 */
export type FocusTarget = "heading" | "name" | "none";

/** The project screen's one selection, and what selecting does to the screen. */
export interface ProjectSelection {
  readonly selection: Selection | undefined;
  /**
   * Whether the wide layout's inspector is open, or collapsed to a strip
   * on the canvas's right edge. Selecting opens it.
   */
  readonly inspectorOpen: boolean;
  readonly showInspector: (open: boolean) => void;
  /** Which tab the dock shows, whether it's folded, and the user's changes. */
  readonly dock: DockControls;
  /**
   * What starting a run does to the screen: opens the inspector, where
   * the run's verdict and findings are, and shows the dock's Run tab,
   * unfolded, where its evidence is.
   */
  readonly showRun: () => void;
  /**
   * Selects, and shows its details in an open inspector, whose `focus` takes the focus: its heading
   * unless given. Remembers the element that had the focus, such as the
   * button that made the selection, so `close` can return it.
   */
  readonly select: (selection: Selection, focus?: FocusTarget) => void;
  /**
   * Selects something Details shows, such as a step in a workflow's
   * outline, as `select` does, but keeps the element `close` returns the
   * focus to: the one that has it now is in Details, and goes with it.
   */
  readonly selectWithin: (selection: Selection, focus?: FocusTarget) => void;
  /**
   * Selects a finding of the run, which marks its component on the
   * diagram and nothing more: the run's explanation stays, the focus stays
   * on the finding, and the opener isn't changed (UX design §5).
   */
  readonly selectFinding: (key: FindingKey) => void;
  /**
   * Clears the selection, so the inspector shows the run's explanation,
   * leaving the focus where it is.
   */
  readonly clear: () => void;
  /**
   * Whether `target` should take the focus now: true once after a
   * `select` that named it, then false. So Details mounting again, as it
   * does when the window crosses the breakpoint, leaves the focus where it
   * is.
   */
  readonly takeFocus: (target: FocusTarget) => boolean;
  /**
   * Clears the selection, as `clear` does, and returns the focus to the element
   * that had it when the selection was made, if it's still on the page.
   */
  readonly close: () => void;
}

/**
 * The selection, the inspector, and the dock of a project screen, held in
 * its view state (`screen/screen-state.ts`, ADR-0023) and changed only by
 * its transitions, so the diagram, its text version, Details, and the
 * dock read the same ones. One transition changes all it touches, so a
 * workload's selection and its tab in the dock draw in the same render.
 * The focus isn't view state: the target asked to take it, and the
 * element `close` returns it to, are held here, around the state.
 * `reveal` shows an element that may have been hidden since it made the
 * selection, such as a button in a canvas panel closed since, so `close`
 * can return the focus to it.
 */
export function useSelection(reveal: RevealElement): ProjectSelection {
  const [screen, dispatch] = useReducer(nextScreenState, INITIAL_SCREEN_STATE);
  const { request, takeFocus } = useFocusRequest();

  const selectWithin = useCallback(
    (selection: Selection, focus: FocusTarget = "heading") => {
      request(focus);
      dispatch({ kind: "select", selection });
    },
    [request],
  );
  const clear = useCallback(() => {
    request(undefined);
    dispatch({ kind: "clear" });
  }, [request]);
  const { select, close } = useOpener({ selectWithin, clear, reveal });
  const selectFinding = useCallback(
    (key: FindingKey) => {
      request(undefined);
      dispatch({ kind: "select", selection: { kind: "finding", key } });
    },
    [request],
  );
  const inspector = useInspector({ screen, dispatch });
  const dock = useDock({ screen, dispatch });

  const changes = { select, selectWithin, selectFinding, clear, close };
  const regions = { ...inspector, ...dock };
  return { selection: screen.selection, ...regions, ...changes, takeFocus };
}

/** The view state, and how to change it. */
interface ScreenReducer {
  readonly screen: ScreenState;
  readonly dispatch: (transition: ScreenTransition) => void;
}

/** The dock's part of the view state, and the user's changes to it. */
export interface DockControls extends DockState {
  /** Shows the tab `tab`, changing nothing else. */
  readonly show: (tab: OverlayKey) => void;
  /** Folds the dock, or unfolds it. */
  readonly fold: (folded: boolean) => void;
}

/** The dock's tab and folding, the user's show and fold, and Run's. */
function useDock({
  screen,
  dispatch,
}: ScreenReducer): Pick<ProjectSelection, "dock" | "showRun"> {
  const show = useCallback(
    (tab: OverlayKey) => {
      dispatch({ kind: "show-tab", tab });
    },
    [dispatch],
  );
  const fold = useCallback(
    (folded: boolean) => {
      dispatch({ kind: folded ? "fold-dock" : "unfold-dock" });
    },
    [dispatch],
  );
  const showRun = useCallback(() => {
    dispatch({ kind: "run" });
  }, [dispatch]);
  return { dock: { ...screen.dock, show, fold }, showRun };
}

/** Whether the inspector is open, and the user's open and collapse. */
function useInspector({
  screen,
  dispatch,
}: ScreenReducer): Pick<ProjectSelection, "inspectorOpen" | "showInspector"> {
  const showInspector = useCallback(
    (open: boolean) => {
      dispatch({ kind: open ? "open-inspector" : "collapse-inspector" });
    },
    [dispatch],
  );
  return { inspectorOpen: screen.inspector === "open", showInspector };
}

/** Shows an element, if something has hidden it, so it can take the focus. */
export type RevealElement = (element: HTMLElement) => void;

/**
 * The changes the opener is remembered and returned around, and what
 * shows it again.
 */
interface OpenerInput extends Pick<ProjectSelection, "selectWithin" | "clear"> {
  readonly reveal: RevealElement;
}

/**
 * `select`, which remembers the element that had the focus, and `close`,
 * which shows it again if it's been hidden since, and returns the focus
 * to it.
 */
function useOpener({
  selectWithin,
  clear,
  reveal,
}: OpenerInput): Pick<ProjectSelection, "select" | "close"> {
  const opener = useRef<HTMLElement | null>(null);
  const select = useCallback(
    (next: Selection, focus?: FocusTarget) => {
      opener.current = focusedElement();
      selectWithin(next, focus);
    },
    [selectWithin],
  );
  const close = useCallback(() => {
    const element = opener.current;
    opener.current = null;
    clear();
    if (!element?.isConnected) return;
    reveal(element);
    element.focus();
  }, [clear, reveal]);
  return { select, close };
}

/** Which part of Details should take the focus next, if any. */
interface FocusRequest {
  /** Asks for `target` to take the focus; undefined asks for none. */
  readonly request: (target: FocusTarget | undefined) => void;
  readonly takeFocus: ProjectSelection["takeFocus"];
}

/** A focus request, answered once, by the target it names. */
function useFocusRequest(): FocusRequest {
  const requested = useRef<FocusTarget>(undefined);
  const request = useCallback((target: FocusTarget | undefined) => {
    requested.current = target;
  }, []);
  const takeFocus = useCallback((target: FocusTarget) => {
    if (requested.current !== target) return false;
    requested.current = undefined;
    return true;
  }, []);
  return { request, takeFocus };
}

function focusedElement(): HTMLElement | null {
  const element = document.activeElement;
  return element instanceof HTMLElement ? element : null;
}
