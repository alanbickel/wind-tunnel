import type { Selection } from "../../../application/details/selection";
import type { KindHandlers } from "../../../domain/shared/kind-handlers";
import { dispatchKind } from "../../shared/kind-dispatch";

/** The inspector's two states in UX design §5's map. */
export type InspectorState = "open" | "collapsed";

/**
 * The project screen's view state, held in one place (ADR-0023): one
 * part per row of UX design §5's map. It lasts while the screen is open,
 * and isn't saved with the project. The dock and the workload Run runs
 * join it as parts of their own.
 */
export interface ScreenState {
  readonly selection: Selection | undefined;
  readonly inspector: InspectorState;
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

/** Every way the screen's view state can change (UX design §5's rules). */
export type ScreenTransition =
  | SelectTransition
  | ClearTransition
  | CollapseInspectorTransition
  | OpenInspectorTransition;

/** A project screen as it opens: nothing selected, the inspector open. */
export const INITIAL_SCREEN_STATE: ScreenState = {
  selection: undefined,
  inspector: "open",
};

/** Each transition, as a pure function from one state to the next. */
const TRANSITIONS: KindHandlers<
  ScreenTransition,
  (state: ScreenState) => ScreenState
> = {
  select:
    ({ selection }) =>
    () => ({
      selection,
      // Today a workload opens in the dock, so the inspector collapses,
      // which §5's rule 2 forbids; slice 5 of issue 246 stops it.
      inspector: selection.kind === "workload" ? "collapsed" : "open",
    }),
  clear: () => () => ({ selection: undefined, inspector: "open" }),
  "collapse-inspector": () => (state) => ({ ...state, inspector: "collapsed" }),
  "open-inspector": () => (state) => ({ ...state, inspector: "open" }),
};

/** The state `transition` moves the screen to from `state`. */
export function nextScreenState(
  state: ScreenState,
  transition: ScreenTransition,
): ScreenState {
  return dispatchKind(TRANSITIONS, transition)(state);
}
