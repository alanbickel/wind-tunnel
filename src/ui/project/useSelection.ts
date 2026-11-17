import { useCallback, useReducer, useRef } from "react";
import type { Selection } from "../../application/details/selection";
import type { FindingKey } from "../../application/run-analysis/findings/finding";
import { focusInDock } from "./dock/focus-in-dock";
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
   * What starting a run does to the screen: selects the run, so the
   * inspector opens on its explanation, and the dock shows its Run tab,
   * unfolded, where its evidence is. The focus stays, and is remembered,
   * as `select` remembers it, for `close`.
   */
  readonly showRun: () => void;
  /**
   * The id of the workload the run group picks, which a selected workload
   * sets; undefined until one is picked.
   */
  readonly pickedWorkloadId: string | undefined;
  /** Picks a workload in the run group, changing only the pick. */
  readonly pick: (workloadId: string) => void;
  /**
   * The id of the workload open in the dock's Workloads tab, which a
   * selected workload sets and nothing else changes; undefined until one
   * is selected. It may name a workload that has gone since.
   */
  readonly openWorkloadId: string | undefined;
  /**
   * The id of the workflow open in the dock's Workflows tab, which a
   * selected workflow or step sets and nothing else changes; undefined
   * until one is selected. It may name a workflow that has gone since.
   */
  readonly openWorkflowId: string | undefined;
  /**
   * Selects, and shows its details in an open inspector, whose `focus` takes the focus: its heading
   * unless given. Remembers the element that had the focus, such as the
   * button that made the selection, so `close` can return it.
   */
  readonly select: (selection: Selection, focus?: FocusTarget) => void;
  /**
   * Selects as `select` does, but keeps the element `close` returns the
   * focus to: the one that has it now is about to go, such as a step's
   * Remove, or "Add a call" once the call is added.
   */
  readonly selectWithin: (selection: Selection, focus?: FocusTarget) => void;
  /**
   * Selects a finding of the run, which marks its component on the
   * diagram and nothing more: the run's explanation stays, the focus stays
   * on the finding, and the opener isn't changed (UX design §5).
   */
  readonly selectFinding: (key: FindingKey) => void;
  /**
   * Clears the selection, so the inspector shows the project's overview,
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
   * that had it when the selection was made, if it's still on the page
   * (its dock tab, or Unfold, while the dock hides it); if not, to the
   * overview's heading.
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
 */
export function useSelection(): ProjectSelection {
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
  const { runWithin, selectFinding } = useRunSelecting({ request, dispatch });
  const opening = { selectWithin, clear, runWithin, request };
  const opened = useOpener(opening);
  const inspector = useInspector({ screen, dispatch });
  const dock = useDock({ screen, dispatch });
  const picking = usePicking({ screen, dispatch });

  const changes = { ...opened, selectWithin, selectFinding, clear };
  const regions = { ...inspector, ...dock, ...picking };
  const { selection, openWorkloadId, openWorkflowId } = screen;
  const open = { openWorkloadId, openWorkflowId };
  return { selection, ...open, ...regions, ...changes, takeFocus };
}

/** How to change the view state, and to ask for the focus. */
interface RunSelectingInput {
  readonly request: FocusRequest["request"];
  readonly dispatch: ScreenReducer["dispatch"];
}

/** Selecting the run, as Run does, and a finding of it. */
interface RunSelecting extends Pick<ProjectSelection, "selectFinding"> {
  /** Selects the run, as Run does, leaving the focus and the opener. */
  readonly runWithin: () => void;
}

/**
 * Selecting the run, or one of its findings, neither of which moves the
 * focus: Run, and the finding, are where the user is.
 */
function useRunSelecting({
  request,
  dispatch,
}: RunSelectingInput): RunSelecting {
  const runWithin = useCallback(() => {
    request(undefined);
    dispatch({ kind: "run" });
  }, [request, dispatch]);
  const selectFinding = useCallback(
    (key: FindingKey) => {
      request(undefined);
      dispatch({ kind: "select", selection: { kind: "finding", key } });
    },
    [request, dispatch],
  );
  return { runWithin, selectFinding };
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

/** The dock's tab and folding, and the user's show and fold. */
function useDock({
  screen,
  dispatch,
}: ScreenReducer): Pick<ProjectSelection, "dock"> {
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
  return { dock: { ...screen.dock, show, fold } };
}

/** The run group's pick, and how to change it. */
function usePicking({
  screen,
  dispatch,
}: ScreenReducer): Pick<ProjectSelection, "pickedWorkloadId" | "pick"> {
  const pick = useCallback(
    (workloadId: string) => {
      dispatch({ kind: "pick", workloadId });
    },
    [dispatch],
  );
  return { pickedWorkloadId: screen.pickedWorkloadId, pick };
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

/**
 * The changes the opener is remembered and returned around, and how to
 * ask for the focus when it's gone.
 */
interface OpenerInput extends Pick<ProjectSelection, "selectWithin" | "clear"> {
  /** Selects the run, as Run does, keeping the opener. */
  readonly runWithin: () => void;
  readonly request: FocusRequest["request"];
}

/**
 * `select` and `showRun`, which remember the element that had the focus,
 * and `close`, which returns the focus to it, or to its dock tab (or
 * Unfold) if the dock hides it now. If it's gone from the page, as the overview's verdict
 * goes once it selects the run, the overview's heading takes the focus,
 * so it isn't lost.
 */
function useOpener(
  input: OpenerInput,
): Pick<ProjectSelection, "select" | "close" | "showRun"> {
  const { selectWithin, clear, runWithin, request } = input;
  const opener = useRef<HTMLElement | null>(null);
  const select = useCallback(
    (next: Selection, focus?: FocusTarget) => {
      opener.current = focusedElement();
      selectWithin(next, focus);
    },
    [selectWithin],
  );
  const showRun = useCallback(() => {
    opener.current = focusedElement();
    runWithin();
  }, [runWithin]);
  const close = useCallback(() => {
    const element = opener.current;
    opener.current = null;
    clear();
    if (!element?.isConnected) {
      request("heading");
      return;
    }
    focusInDock(element);
  }, [clear, request]);
  return { select, close, showRun };
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

/**
 * The element that has the focus, if any: the body, which has it when
 * nothing does, is no place to return it to.
 */
function focusedElement(): HTMLElement | null {
  const element = document.activeElement;
  if (element === document.body) return null;
  return element instanceof HTMLElement ? element : null;
}
