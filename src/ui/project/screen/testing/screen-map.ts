import type { Selection } from "../../../../application/details/selection";
import {
  INITIAL_SCREEN_STATE,
  nextScreenState,
  type OverlayKey,
  type ScreenState,
  type ScreenTransition,
} from "../screen-state";

// One of each selection and transition, for the tests of UX design §5's
// map (`screen-state*.test.ts`), and `after`, which plays transitions
// from the state a screen opens in.

export const COMPONENT: Selection = { kind: "component", componentId: "api" };
export const EDGE: Selection = { kind: "edge", edgeId: "api-db" };
export const WORKFLOW: Selection = { kind: "workflow", workflowId: "order" };
export const STEP: Selection = {
  kind: "step",
  workflowId: "order",
  stepId: "s1",
};
export const WORKLOAD: Selection = { kind: "workload", workloadId: "rush" };
export const NEW_WORKFLOW: Selection = { kind: "new-workflow" };
export const THE_RUN: Selection = { kind: "run" };
export const FINDING: Selection = {
  kind: "finding",
  key: {
    kind: "waiting-holds-limit",
    componentId: "api",
    reason: undefined,
    limitName: undefined,
  },
};

export const EVERY_SELECTION = [
  COMPONENT,
  EDGE,
  WORKFLOW,
  STEP,
  WORKLOAD,
  NEW_WORKFLOW,
  THE_RUN,
  FINDING,
];
export const ALL_BUT_WORKLOAD = EVERY_SELECTION.filter((s) => s !== WORKLOAD);
/** The selections that open a workflow in the Workflows tab. */
export const OF_A_WORKFLOW: readonly Selection[] = [WORKFLOW, STEP];
/** Every selection but a workflow and a step. */
export const NOT_OF_A_WORKFLOW = EVERY_SELECTION.filter(
  (s) => !OF_A_WORKFLOW.includes(s),
);
/** The selections that show no dock tab as they're made (rule 3). */
export const SHOWING_NO_TAB = NOT_OF_A_WORKFLOW.filter(
  (s) => s !== WORKLOAD && s !== THE_RUN,
);
/** The selections a run can be replaced under: the run, and its finding. */
export const OF_THE_RUN = [THE_RUN, FINDING];
/** Every selection but the run, so each can move to it. */
export const ALL_BUT_THE_RUN = EVERY_SELECTION.filter((s) => s !== THE_RUN);

export const SELECT = (selection: Selection): ScreenTransition => ({
  kind: "select",
  selection,
});
export const CLEAR: ScreenTransition = { kind: "clear" };
export const COLLAPSE: ScreenTransition = { kind: "collapse-inspector" };
export const OPEN: ScreenTransition = { kind: "open-inspector" };
export const SHOW = (tab: OverlayKey): ScreenTransition => ({
  kind: "show-tab",
  tab,
});
export const FOLD: ScreenTransition = { kind: "fold-dock" };
export const UNFOLD: ScreenTransition = { kind: "unfold-dock" };
export const RUN: ScreenTransition = { kind: "run" };
export const PICK = (workloadId: string): ScreenTransition => ({
  kind: "pick",
  workloadId,
});

export const EVERY_TAB: readonly OverlayKey[] = [
  "library",
  "components",
  "workflows",
  "workloads",
  "run",
];

/** The state the screen reaches by `transitions`, from when it opens. */
export function after(...transitions: ScreenTransition[]): ScreenState {
  return transitions.reduce(nextScreenState, INITIAL_SCREEN_STATE);
}
