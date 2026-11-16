import { describe, expect, it } from "vitest";
import type { Selection } from "../../../application/details/selection";
import {
  INITIAL_SCREEN_STATE,
  nextScreenState,
  type ScreenState,
  type ScreenTransition,
} from "./screen-state";

// The map of UX design §5, as far as the screen's state holds it today:
// the selection and the inspector. Each rule and limit about them has a
// test where today's screen follows it, and an `it.todo` naming the
// #246 slice that makes it hold where it doesn't.

const COMPONENT: Selection = { kind: "component", componentId: "api" };
const EDGE: Selection = { kind: "edge", edgeId: "api-db" };
const WORKFLOW: Selection = { kind: "workflow", workflowId: "order" };
const STEP: Selection = { kind: "step", workflowId: "order", stepId: "s1" };
const WORKLOAD: Selection = { kind: "workload", workloadId: "rush" };
const NEW_WORKFLOW: Selection = { kind: "new-workflow" };
const FINDING: Selection = {
  kind: "finding",
  key: {
    kind: "waiting-holds-limit",
    componentId: "api",
    reason: undefined,
    limitName: undefined,
  },
};

const EVERY_SELECTION = [
  COMPONENT,
  EDGE,
  WORKFLOW,
  STEP,
  WORKLOAD,
  NEW_WORKFLOW,
  FINDING,
];
const ALL_BUT_WORKLOAD = EVERY_SELECTION.filter((s) => s !== WORKLOAD);

const SELECT = (selection: Selection): ScreenTransition => ({
  kind: "select",
  selection,
});
const CLEAR: ScreenTransition = { kind: "clear" };
const COLLAPSE: ScreenTransition = { kind: "collapse-inspector" };
const OPEN: ScreenTransition = { kind: "open-inspector" };

/** The state the screen reaches by `transitions`, from when it opens. */
function after(...transitions: ScreenTransition[]): ScreenState {
  return transitions.reduce(nextScreenState, INITIAL_SCREEN_STATE);
}

describe("the map: the selection and the inspector", () => {
  // Fails if a screen opens with something selected or the inspector collapsed.
  it("opens with nothing selected and the inspector open", () => {
    expect(INITIAL_SCREEN_STATE).toEqual({
      selection: undefined,
      inspector: "open",
    });
  });

  // Fails if `select` drops or swaps the selection it's given, for any kind.
  it.each(EVERY_SELECTION)("selects a $kind", (selection) => {
    expect(after(SELECT(selection)).selection).toBe(selection);
  });

  it.todo("the run can be selected (slice 3 of #246)");

  // Fails if collapsing the inspector clears the selection, or any kind
  // can't be seen with the inspector collapsed.
  it.each(EVERY_SELECTION)(
    "shows a $kind with the inspector collapsed",
    (selection) => {
      expect(after(SELECT(selection), COLLAPSE)).toEqual({
        selection,
        inspector: "collapsed",
      });
    },
  );

  // Fails if opening the inspector clears the selection, or any kind
  // can't be seen with the inspector open.
  it.each(EVERY_SELECTION)(
    "shows a $kind with the inspector open",
    (selection) => {
      expect(after(SELECT(selection), COLLAPSE, OPEN)).toEqual({
        selection,
        inspector: "open",
      });
    },
  );

  // Fails if a collapsed inspector loses what it held, so opening it again
  // shows something else.
  it("opens a collapsed inspector on what it held", () => {
    const collapsed = after(SELECT(COMPONENT), COLLAPSE);
    expect(nextScreenState(collapsed, OPEN).selection).toBe(COMPONENT);
  });

  // Fails if collapsing or opening an inspector already in that state makes
  // a new state, so React renders the screen again for nothing.
  it.each([
    ["collapsing a collapsed", after(COLLAPSE), COLLAPSE],
    ["opening an open", INITIAL_SCREEN_STATE, OPEN],
  ] as const)("keeps the state on %s inspector", (_, state, transition) => {
    expect(nextScreenState(state, transition)).toBe(state);
  });

  it.todo("no run: the run and a finding can't be selected (slice 3 of #246)");
});

describe("how the selection moves", () => {
  // Fails if selecting another thing keeps the first one selected.
  it("moves from one thing to another", () => {
    expect(after(SELECT(COMPONENT), SELECT(EDGE)).selection).toBe(EDGE);
  });

  // Fails if clicking a box with a finding selected keeps the finding.
  it("moves from a finding to a thing", () => {
    expect(after(SELECT(FINDING), SELECT(COMPONENT)).selection).toBe(COMPONENT);
  });

  // Fails if × (or Escape, the empty canvas, or a remove) leaves something
  // selected.
  it.each(EVERY_SELECTION)("clears a $kind to nothing", (selection) => {
    expect(after(SELECT(selection), CLEAR).selection).toBeUndefined();
  });

  it.todo("Run selects the run, from nothing or a thing (slice 3 of #246)");
  it.todo("a verdict selects the run again (slice 3 of #246)");
  it.todo("a finding moves back to the run on Run (slice 3 of #246)");
  it.todo(
    "a new run replaces the run, so a selected finding becomes the run (slice 3 of #246)",
  );
});

describe("rule 1: the selection alone decides what the inspector shows", () => {
  it.todo(
    "showing a dock tab leaves the selection and the inspector (#250, slice 2 of #246)",
  );
  it.todo(
    "picking a workload in the run group leaves the selection (#251, slice 2 of #246)",
  );
});

describe("rule 2: only the user collapses the inspector", () => {
  // Fails if selecting anything but a workload collapses the inspector.
  it.each(ALL_BUT_WORKLOAD)(
    "leaves it open on selecting a $kind",
    (selection) => {
      expect(after(SELECT(selection)).inspector).toBe("open");
    },
  );

  // Fails if clearing the selection, as a remove does, collapses the
  // inspector.
  it("leaves it open on clearing the selection", () => {
    expect(after(SELECT(COMPONENT), CLEAR).inspector).toBe("open");
  });

  // Fails if the user's collapse doesn't collapse the inspector.
  it("collapses it when the user does", () => {
    expect(after(COLLAPSE).inspector).toBe("collapsed");
  });

  // Fails if selecting leaves a collapsed inspector collapsed: today the
  // screen opens it again.
  it("opens a collapsed inspector on selecting", () => {
    expect(after(COLLAPSE, SELECT(EDGE)).inspector).toBe("open");
  });

  // Fails if clearing the selection leaves a collapsed inspector collapsed:
  // today the screen opens it again, on the overview.
  it("opens a collapsed inspector on clearing the selection", () => {
    expect(after(SELECT(COMPONENT), COLLAPSE, CLEAR).inspector).toBe("open");
  });

  it.todo(
    "selecting a workload leaves the inspector open: today it collapses (slice 5 of #246)",
  );
  it.todo("Run leaves the inspector as it is (slice 3 of #246)");
});

describe("rule 7: × clears the selection; the chevron collapses", () => {
  // Fails if collapsing the inspector also clears the selection.
  it("collapsing keeps the selection", () => {
    expect(after(SELECT(EDGE), COLLAPSE).selection).toBe(EDGE);
  });

  it.todo(
    "no control does both: today the inspector's one Close clears or collapses by what it shows (slice 6 of #246)",
  );
});
