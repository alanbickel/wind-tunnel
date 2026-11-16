import { describe, expect, it } from "vitest";
import type { Selection } from "../../../application/details/selection";
import {
  INITIAL_SCREEN_STATE,
  nextScreenState,
  type OverlayKey,
  type ScreenState,
  type ScreenTransition,
} from "./screen-state";

// The map of UX design §5, as far as the screen's state holds it today:
// the selection, the inspector, the dock, and the run group's pick.
// Each rule and limit about
// them has a test where today's screen follows it, and an `it.todo` naming
// the #246 slice that makes it hold where it doesn't.

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
const SHOW = (tab: OverlayKey): ScreenTransition => ({ kind: "show-tab", tab });
const FOLD: ScreenTransition = { kind: "fold-dock" };
const UNFOLD: ScreenTransition = { kind: "unfold-dock" };
const RUN: ScreenTransition = { kind: "run" };
const PICK = (workloadId: string): ScreenTransition => ({
  kind: "pick",
  workloadId,
});

const EVERY_TAB: readonly OverlayKey[] = ["run", "workload"];

/** The state the screen reaches by `transitions`, from when it opens. */
function after(...transitions: ScreenTransition[]): ScreenState {
  return transitions.reduce(nextScreenState, INITIAL_SCREEN_STATE);
}

describe("the map: the selection and the inspector", () => {
  // Fails if a screen opens with something selected or the inspector collapsed.
  it("opens with nothing selected and the inspector open", () => {
    expect(INITIAL_SCREEN_STATE).toMatchObject({
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
      expect(after(SELECT(selection), COLLAPSE)).toMatchObject({
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
      expect(after(SELECT(selection), COLLAPSE, OPEN)).toMatchObject({
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

describe("the map: the dock", () => {
  // Fails if a screen opens on another tab than Run, or folded.
  it("opens unfolded, on the Run tab", () => {
    expect(INITIAL_SCREEN_STATE.dock).toEqual({ shown: "run", folded: false });
  });

  // Fails if any selection can't be seen beside some tab, folded or not.
  describe.each(EVERY_SELECTION)("beside a $kind", (selection) => {
    it.each(
      EVERY_TAB.flatMap((tab) => [[tab, true] as const, [tab, false] as const]),
    )("shows the %s tab, folded %s", (tab, folded) => {
      const shown = after(
        SELECT(selection),
        SHOW(tab),
        ...(folded ? [FOLD] : []),
      );
      expect(shown).toMatchObject({ selection, dock: { shown: tab, folded } });
    });
  });

  // Fails if a folded dock loses its tab, so unfolding it shows another.
  it("unfolds on the tab it held", () => {
    const folded = after(SHOW("workload"), FOLD);
    expect(nextScreenState(folded, UNFOLD).dock).toEqual({
      shown: "workload",
      folded: false,
    });
  });

  // Fails if a change the dock already shows makes a new state, so React
  // renders the screen again for nothing.
  it.each([
    ["showing the tab shown", INITIAL_SCREEN_STATE, SHOW("run")],
    ["folding a folded", after(FOLD), FOLD],
    ["unfolding an unfolded", INITIAL_SCREEN_STATE, UNFOLD],
  ] as const)("keeps the state on %s dock", (_, state, transition) => {
    expect(nextScreenState(state, transition)).toBe(state);
  });

  // Which tabs are there isn't held here: the dock reads it from the run
  // and the selection, so "no run: the Run tab isn't there" is tested in
  // `dock/overlays.test.tsx`.
  it.todo(
    "Library, Components, Workflows, and Workloads are always there (slice 4 of #246)",
  );
});

describe("rule 1: the selection alone decides what the inspector shows", () => {
  // Fails if showing a tab changes the selection or the inspector.
  it.each(EVERY_TAB)("showing the %s tab leaves them", (tab) => {
    const before = after(SELECT(EDGE), COLLAPSE);
    expect(nextScreenState(before, SHOW(tab))).toMatchObject({
      selection: EDGE,
      inspector: "collapsed",
    });
  });

  // Fails if folding or unfolding the dock changes the selection or the
  // inspector.
  it.each([
    ["folding", FOLD],
    ["unfolding", UNFOLD],
  ] as const)("%s the dock leaves them", (_, transition) => {
    const before = after(SELECT(EDGE), COLLAPSE, FOLD, UNFOLD);
    expect(nextScreenState(before, transition)).toMatchObject({
      selection: EDGE,
      inspector: "collapsed",
    });
  });

  // Fails if picking a workload in the run group changes the selection or
  // the inspector, whatever is selected.
  it.each(EVERY_SELECTION)(
    "picking a workload leaves a selected $kind",
    (selection) => {
      const before = after(SELECT(selection), COLLAPSE);
      expect(nextScreenState(before, PICK("lunch"))).toMatchObject({
        selection,
        inspector: "collapsed",
      });
    },
  );
});

describe("rule 5: the run group picks the workload you select", () => {
  // Fails if a screen opens with a workload picked: the screen shows the
  // project's first until one is.
  it("opens with none picked", () => {
    expect(INITIAL_SCREEN_STATE.pickedWorkloadId).toBeUndefined();
  });

  // Fails if selecting a workload doesn't pick it, from nothing or over
  // another pick, in the same dispatch.
  it.each([
    ["nothing picked", after()],
    ["another picked", after(PICK("lunch"))],
  ])("picks a selected workload over %s", (_, before) => {
    expect(nextScreenState(before, SELECT(WORKLOAD)).pickedWorkloadId).toBe(
      "rush",
    );
  });

  // Fails if picking in the run group changes what's dispatched anywhere
  // but the pick: the selection, the inspector, or the dock.
  it("a pick changes only the pick", () => {
    const before = after(SELECT(WORKLOAD), SHOW("run"), FOLD);
    expect(nextScreenState(before, PICK("lunch"))).toEqual({
      ...before,
      pickedWorkloadId: "lunch",
    });
  });

  // Fails if selecting something that isn't a workload changes the pick.
  it.each(ALL_BUT_WORKLOAD)("a $kind's selection leaves the pick", (s) => {
    expect(after(PICK("lunch"), SELECT(s)).pickedWorkloadId).toBe("lunch");
  });

  // Fails if clearing the selection changes the pick.
  it("clearing the selection leaves the pick", () => {
    expect(after(SELECT(WORKLOAD), CLEAR).pickedWorkloadId).toBe("rush");
  });

  // Fails if picking the workload already picked makes a new state, so React
  // renders the screen again for nothing.
  it("keeps the state on picking the one picked", () => {
    const state = after(PICK("lunch"));
    expect(nextScreenState(state, PICK("lunch"))).toBe(state);
  });
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
  // Fails if Run leaves a collapsed inspector collapsed: today the screen
  // opens it, where the run's verdict and findings are.
  it("opens a collapsed inspector on Run", () => {
    expect(after(COLLAPSE, RUN).inspector).toBe("open");
  });

  it.todo("Run leaves the inspector as it is (slice 3 of #246)");
});

describe("rule 2: only the user folds the dock", () => {
  // Fails if selecting anything, or clearing, or Run, folds the dock.
  it.each([
    ...EVERY_SELECTION.map(
      (s) => [`selecting a ${s.kind}`, SELECT(s)] as const,
    ),
    ["clearing the selection", CLEAR] as const,
    ["Run", RUN] as const,
  ])("leaves it unfolded on %s", (_, transition) => {
    expect(after(SELECT(COMPONENT), transition).dock.folded).toBe(false);
  });

  // Fails if a selection that shows no tab unfolds a folded dock, or
  // clearing the selection does.
  it.each([
    ...ALL_BUT_WORKLOAD.map(
      (s) => [`selecting a ${s.kind}`, SELECT(s)] as const,
    ),
    ["clearing the selection", CLEAR] as const,
  ])("leaves it folded on %s", (_, transition) => {
    expect(after(FOLD, transition).dock.folded).toBe(true);
  });

  // Fails if the user's fold doesn't fold the dock.
  it("folds it when the user does", () => {
    expect(after(FOLD).dock.folded).toBe(true);
  });

  // Fails if selecting a workload leaves a folded dock folded, so its
  // editor's heading can't take the focus.
  it("unfolds it on selecting a workload, the same one again included", () => {
    expect(after(SELECT(WORKLOAD), FOLD, SELECT(WORKLOAD)).dock.folded).toBe(
      false,
    );
  });

  // Fails if Run leaves a folded dock folded, so the run's evidence is hidden.
  it("unfolds it on Run", () => {
    expect(after(FOLD, RUN).dock.folded).toBe(false);
  });

  it.todo(
    "selecting a workflow or a step unfolds it on Workflows (slice 4 of #246)",
  );
});

describe("rule 3: a selection may show a tab; switching tabs changes nothing else", () => {
  // Fails if selecting a workload doesn't show its tab, or selecting it
  // again over another tab doesn't.
  it("shows the workload's tab on selecting a workload, the same one again included", () => {
    const again = after(SELECT(WORKLOAD), SHOW("run"), SELECT(WORKLOAD));
    expect(again.dock.shown).toBe("workload");
  });

  // Fails if Run doesn't show the Run tab, or changes the selection.
  it("shows the Run tab on Run, keeping the selection", () => {
    expect(after(SELECT(WORKLOAD), RUN)).toMatchObject({
      selection: WORKLOAD,
      dock: { shown: "run" },
    });
  });

  // Fails if showing a tab folds or unfolds the dock. Rule 1's tests
  // check it leaves the selection and the inspector. Each tab keeping its
  // own state while another shows is the UI's, tested in
  // `OpenedProject.dock.test.tsx`.
  it.each([true, false])("leaves the folding as it is, folded %s", (folded) => {
    const before = after(...(folded ? [FOLD] : []));
    expect(nextScreenState(before, SHOW("workload")).dock).toEqual({
      shown: "workload",
      folded,
    });
  });

  it.todo(
    "a workload shows the Workloads tab, with its editor open (slice 4 of #246)",
  );
  it.todo("a workflow or a step shows the Workflows tab (slice 4 of #246)");
  it.todo("Run selects the run, which shows the Run tab (slice 3 of #246)");
});

describe("the limit: a selection shows a tab only as it's made", () => {
  // Fails if a selection that shows no tab moves the dock off its tab.
  it.each(ALL_BUT_WORKLOAD)(
    "leaves the tab on selecting a $kind",
    (selection) => {
      expect(after(SHOW("workload"), SELECT(selection)).dock.shown).toBe(
        "workload",
      );
    },
  );

  // Fails if clearing the selection moves the dock off its tab.
  it("leaves the tab on clearing the selection", () => {
    expect(after(SELECT(WORKLOAD), CLEAR).dock.shown).toBe("workload");
  });

  // Fails if picking in the run group moves the dock off its tab.
  it("leaves the tab on picking a workload", () => {
    expect(after(SHOW("run"), PICK("lunch")).dock.shown).toBe("run");
  });

  // Fails if a selection holds its tab, so the user can't show another
  // beside it.
  it("lets the user show another tab beside a selected workload", () => {
    expect(after(SELECT(WORKLOAD), SHOW("run"))).toMatchObject({
      selection: WORKLOAD,
      dock: { shown: "run" },
    });
  });
});

describe("the limit: the run group picks a workload only as it's selected", () => {
  // Fails if a later pick in the run group moves the selection with it, or
  // is undone by the selection that came before it.
  it("leaves the workload selected but not picked after another is picked", () => {
    expect(after(SELECT(WORKLOAD), PICK("lunch"))).toMatchObject({
      selection: WORKLOAD,
      pickedWorkloadId: "lunch",
    });
  });
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
