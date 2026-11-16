import type { Selection } from "../../../application/details/selection";
import type { KindHandlers } from "../../../domain/shared/kind-handlers";
import { dispatchKind } from "../../shared/kind-dispatch";

/** The inspector's two states in UX design §5's map. */
export type InspectorState = "open" | "collapsed";

/** The dock's tabs, by key: the keys of its overlays (`dock/overlays.ts`). */
export type OverlayKey = "run" | "workload";

/**
 * The dock in UX design §5's map: which tab shows, and whether it's
 * folded. Which tabs are there isn't held: the dock reads that from the
 * project, the run, and the selection, and shows the first one left when
 * `shown` isn't there.
 */
export interface DockState {
  readonly shown: OverlayKey;
  readonly folded: boolean;
}

/**
 * The project screen's view state, held in one place (ADR-0023): one
 * part per row of UX design §5's map. It lasts while the screen is open,
 * and isn't saved with the project.
 */
export interface ScreenState {
  readonly selection: Selection | undefined;
  readonly inspector: InspectorState;
  readonly dock: DockState;
  /**
   * The id of the workload the run group picks, which Run runs; undefined
   * until one is picked. The screen reads the workload from the project
   * each time, and shows the project's first when this isn't there, so
   * the state holds no project data.
   */
  readonly pickedWorkloadId: string | undefined;
}

/** Selects one thing, from anywhere: a box, a row, Details, or a finding. */
export interface SelectTransition {
  readonly kind: "select";
  readonly selection: Selection;
}

/** Clears the selection: the inspector's ×, the empty canvas, a remove. */
export interface ClearTransition {
  readonly kind: "clear";
}

/** The user collapses the inspector to a strip. */
export interface CollapseInspectorTransition {
  readonly kind: "collapse-inspector";
}

/** Opens the collapsed inspector again. */
export interface OpenInspectorTransition {
  readonly kind: "open-inspector";
}

/** The user shows one of the dock's tabs. */
export interface ShowTabTransition {
  readonly kind: "show-tab";
  readonly tab: OverlayKey;
}

/** The user folds the dock to one line. */
export interface FoldDockTransition {
  readonly kind: "fold-dock";
}

/** The user unfolds the folded dock. */
export interface UnfoldDockTransition {
  readonly kind: "unfold-dock";
}

/** A run starts: the inspector opens, and the dock shows the Run tab. */
export interface RunTransition {
  readonly kind: "run";
}

/** The run group picks a workload, which changes only the pick (rule 5). */
export interface PickTransition {
  readonly kind: "pick";
  readonly workloadId: string;
}

/** Every way the screen's view state can change (UX design §5's rules). */
export type ScreenTransition =
  | SelectTransition
  | PickTransition
  | ClearTransition
  | CollapseInspectorTransition
  | OpenInspectorTransition
  | ShowTabTransition
  | FoldDockTransition
  | UnfoldDockTransition
  | RunTransition;

/**
 * A project screen as it opens: nothing selected, the inspector open, and
 * the dock unfolded on the Run tab, which shows once a run starts.
 */
export const INITIAL_SCREEN_STATE: ScreenState = {
  selection: undefined,
  inspector: "open",
  dock: { shown: "run", folded: false },
  pickedWorkloadId: undefined,
};

/** Each transition, as a pure function from one state to the next. */
const TRANSITIONS: KindHandlers<
  ScreenTransition,
  (state: ScreenState) => ScreenState
> = {
  select:
    ({ selection }) =>
    (state) =>
      selection.kind === "workload"
        ? // Today a workload opens in the dock, so the inspector collapses,
          // which §5's rule 2 forbids; slice 5 of issue 246 stops it.
          {
            ...state,
            selection,
            inspector: "collapsed",
            dock: unfoldedOn("workload"),
            // Rule 5: a selected workload is picked, in the same dispatch.
            pickedWorkloadId: selection.workloadId,
          }
        : { ...state, selection, inspector: "open" },
  pick:
    ({ workloadId }) =>
    (state) =>
      state.pickedWorkloadId === workloadId
        ? state
        : { ...state, pickedWorkloadId: workloadId },
  clear: () => (state) => ({
    ...state,
    selection: undefined,
    inspector: "open",
  }),
  "collapse-inspector": () => (state) => withInspector(state, "collapsed"),
  "open-inspector": () => (state) => withInspector(state, "open"),
  "show-tab":
    ({ tab }) =>
    (state) =>
      withDock(state, { ...state.dock, shown: tab }),
  "fold-dock": () => (state) =>
    withDock(state, { ...state.dock, folded: true }),
  "unfold-dock": () => (state) =>
    withDock(state, { ...state.dock, folded: false }),
  run: () => (state) => ({
    ...state,
    inspector: "open",
    dock: unfoldedOn("run"),
  }),
};

/** The dock showing `tab`, unfolded. */
function unfoldedOn(tab: OverlayKey): DockState {
  return { shown: tab, folded: false };
}

/**
 * `state` with the inspector `inspector`. It's `state` itself when the
 * inspector already is, so React skips the render, as `useState` did.
 */
function withInspector(
  state: ScreenState,
  inspector: InspectorState,
): ScreenState {
  return state.inspector === inspector ? state : { ...state, inspector };
}

/**
 * `state` with the dock `dock`. It's `state` itself when the dock already
 * is, so React skips the render, as `useState` did.
 */
function withDock(state: ScreenState, dock: DockState): ScreenState {
  const same =
    state.dock.shown === dock.shown && state.dock.folded === dock.folded;
  return same ? state : { ...state, dock };
}

/** The state `transition` moves the screen to from `state`. */
export function nextScreenState(
  state: ScreenState,
  transition: ScreenTransition,
): ScreenState {
  return dispatchKind(TRANSITIONS, transition)(state);
}
