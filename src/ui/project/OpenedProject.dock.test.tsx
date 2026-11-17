// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import type { Project } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { revealButton } from "./testing/canvas-panels";
import {
  bar,
  groupVerdict,
  clickRun,
  detailsHeading,
  dock,
  dockPanel,
  dockTabs,
  inspector,
  queryDetailsHeading,
  renderOpenedProject as renderProject,
  runGroup,
  type RenderedProject,
} from "./testing/render-opened-project";

const [steady] = sampleRecord.project.workloads;
if (steady === undefined) throw new Error("The sample has a workload");

/** Two workloads, "Steady" and "Spike", so a pick can differ from the first. */
const twoWorkloads: Project = {
  ...sampleRecord.project,
  workloads: [steady, { ...steady, id: "spike", name: "Spike" }],
};

/** The dock's tabs that are always there, in order: then Run, once a run starts. */
const ALWAYS_THERE = ["Library", "Components", "Workflows", "Workloads"];

/** Selects a workload from its row in the "Workloads" list. */
function openWorkload(name: string): void {
  const row = revealButton(name);
  row.focus();
  fireEvent.click(row);
}

function openSteady(): void {
  openWorkload("Steady");
}

/** The heading of the Workloads tab's editor: the open workload's name. */
function editorHeading(name: string): HTMLElement {
  return within(dockPanel("Workloads")).getByRole("heading", {
    level: 4,
    name,
  });
}

/** Presses the run group's Edit, which selects the picked workload. */
function pressEdit(): void {
  const edit = screen.getByRole("button", { name: "Edit" });
  edit.focus();
  fireEvent.click(edit);
}

/** A tab of the dock's, by its label. */
function dockTab(name: string): HTMLElement {
  return within(dock()).getByRole("tab", { name });
}

/** The label of the dock's selected tab. */
function shownTab(): string | null | undefined {
  return within(dock())
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;
}

function picked(): string {
  return screen.getByRole<HTMLSelectElement>("combobox", { name: "Workload" })
    .value;
}

/** Runs the picked workload for a second, and finishes the run. */
async function runASecond({ runner }: RenderedProject): Promise<void> {
  clickRun();
  runner.send(sampleSnapshot({ second: 1, read: { started: 5 } }));
  await runner.finish();
}

describe("OpenedProject's dock", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the dock leaves out Library, Components, Workflows, or Workloads with no
  // run and nothing selected, opens on another than Library, or a workload
  // doesn't open in the Workloads tab, which shows.
  it("shows Library, Components, Workflows, and Workloads, and opens a workload in Workloads", () => {
    renderProject();
    expect(dockTabs()).toEqual(ALWAYS_THERE);
    expect(shownTab()).toBe("Library");

    openSteady();

    expect(dockTabs()).toEqual(ALWAYS_THERE);
    expect(shownTab()).toBe("Workloads");
    expect(editorHeading("Steady")).toBeTruthy();
  });

  // Fails if selecting a workload collapses the inspector (rule 2), or the
  // inspector leaves out its name, problems, or Remove, or holds its
  // editor, which is the tab's, or its name field is in both.
  it("keeps the inspector open on a workload: its name, problems, and Remove", () => {
    renderProject();

    openSteady();

    const chevron = screen.getByRole("button", {
      name: "Collapse the inspector",
    });
    expect(chevron.getAttribute("aria-expanded")).toBe("true");
    expect(detailsHeading().textContent).toBe("Steady · Workload");
    expect(document.activeElement).toBe(detailsHeading());
    const details = screen.getByRole("region", { name: "Details" });
    const inDetails = within(details);
    expect(inDetails.getByRole("textbox", { name: "Name" })).toBeTruthy();
    expect(inDetails.getByText(/^No problems: it can run\./)).toBeTruthy();
    expect(inDetails.getByRole("button", { name: "Remove" })).toBeTruthy();
    expect(inDetails.queryByRole("textbox", { name: "Duration" })).toBeNull();
    expect(screen.getAllByRole("textbox", { name: "Name" })).toHaveLength(1);
  });

  // Fails if the Run overlay waits for something other than the run
  // starting (such as `meaning`), or showing it moves the focus off Run,
  // as mounting the run group afresh when the first tab appears would.
  it("shows a Run tab once a run starts, with the focus left on Run", () => {
    renderProject();
    const run = screen.getByRole("button", { name: "Run" });
    run.focus();

    fireEvent.click(run);

    expect(dockTabs()).toEqual([...ALWAYS_THERE, "Run"]);
    expect(shownTab()).toBe("Run");
    expect(document.activeElement).toBe(run);
  });

  // Fails if the tabs aren't in the modeling loop's order, Workloads just
  // before Run, or Workloads doesn't show on a workload's selection while a
  // run is there.
  it("holds Workloads before Run, and shows it on a workload's selection", async () => {
    const shown = renderProject();
    await runASecond(shown);

    openSteady();

    expect(dockTabs()).toEqual([...ALWAYS_THERE, "Run"]);
    expect(shownTab()).toBe("Workloads");
    expect(document.activeElement).toBe(detailsHeading());
  });

  // Fails if the editor's heading is a copy taken when the workload
  // opened, rather than its name read from the project as it is.
  it("follows a rename in the editor's heading", () => {
    renderProject();
    openSteady();
    const name = screen.getByRole("textbox", { name: "Name" });

    fireEvent.change(name, { target: { value: "Dinner" } });
    fireEvent.keyDown(name, { key: "Enter" });

    expect(editorHeading("Dinner")).toBeTruthy();
  });

  // Fails if switching the dock's tabs changes the selection, the pick,
  // or the workload open in the Workloads tab.
  it("keeps the workload selected, picked, and open while Run shows", async () => {
    const shown = renderProject({ project: twoWorkloads });
    await runASecond(shown);
    openWorkload("Spike");
    expect(picked()).toBe("spike");

    fireEvent.click(dockTab("Run"));

    expect(shownTab()).toBe("Run");
    expect(picked()).toBe("spike");
    expect(detailsHeading().textContent).toBe("Spike · Workload");
    fireEvent.click(dockTab("Workloads"));
    expect(editorHeading("Spike")).toBeTruthy();
  });

  // Fails if switching the dock's tabs clears or replaces a component's
  // selection in the inspector.
  it("keeps a component in the inspector while the dock shows Run", async () => {
    const shown = renderProject();
    await runASecond(shown);
    const button = revealButton(/^Function \(Lambda\)/);
    button.focus();
    fireEvent.click(button);

    fireEvent.click(dockTab("Run"));

    expect(detailsHeading().textContent).toBe("Function · Lambda");
  });

  // Fails if a half-typed field loses its draft when the dock switches to
  // Run and back: the hidden overlay must stay mounted.
  it("keeps a draft across a switch to Run and back", async () => {
    const shown = renderProject();
    await runASecond(shown);
    openSteady();
    const duration = within(dock()).getByRole("textbox", { name: "Duration" });
    fireEvent.change(duration, { target: { value: "abc" } });

    fireEvent.click(dockTab("Run"));
    fireEvent.click(dockTab("Workloads"));

    const again = within(dock()).getByRole("textbox", { name: "Duration" });
    expect(again).toBe(duration);
    expect((again as HTMLInputElement).value).toBe("abc");
  });

  // Fails if the tab closes its workload, or loses its draft, once a
  // component is selected instead (rule 3: the tab keeps what it has
  // open), or the inspector doesn't move to the component.
  it("keeps its workload open, draft and all, while a component is selected", () => {
    renderProject();
    openSteady();
    const duration = within(dock()).getByRole("textbox", { name: "Duration" });
    fireEvent.change(duration, { target: { value: "abc" } });

    const component = revealButton(/^Function \(Lambda\)/);
    fireEvent.click(component);
    expect(detailsHeading().textContent).toBe("Function · Lambda");
    fireEvent.click(dockTab("Workloads"));

    expect(editorHeading("Steady")).toBeTruthy();
    const again = within(dock()).getByRole("textbox", { name: "Duration" });
    expect(again).toBe(duration);
    expect((again as HTMLInputElement).value).toBe("abc");
  });

  // Fails if selecting a workload while Run shows leaves Run showing.
  it("shows Workloads when a workload is selected over Run", async () => {
    const shown = renderProject();
    await runASecond(shown);
    openSteady();
    fireEvent.click(dockTab("Run"));

    pressEdit();

    expect(shownTab()).toBe("Workloads");
    expect(document.activeElement).toBe(detailsHeading());
  });

  // Fails if Run while Workloads shows leaves it showing, or keeps the
  // workload selected rather than selecting the run, or moves the focus
  // off Run, or takes the Workloads tab away.
  it("switches to Run on Run, selecting the run and keeping the focus", async () => {
    const shown = renderProject();
    await runASecond(shown);
    openSteady();
    const run = screen.getByRole("button", { name: "Run" });
    run.focus();

    fireEvent.click(run);

    expect(shownTab()).toBe("Run");
    expect(dockTabs()).toEqual([...ALWAYS_THERE, "Run"]);
    expect(document.activeElement).toBe(run);
  });

  // Fails if the inspector's × or Escape leaves the workload selected, or
  // changes the dock: its tabs, the one shown, the workload open in it, or
  // the pick (rule 7: × clears the selection, and nothing else).
  it.each(["Close", "Escape"])(
    "clears the selection on %s, leaving the tab as it is",
    async (how) => {
      const shown = renderProject();
      await runASecond(shown);
      openSteady();

      if (how === "Escape") {
        fireEvent.keyDown(detailsHeading(), { key: "Escape" });
      } else {
        fireEvent.click(
          screen.getByRole("button", { name: "Close the details" }),
        );
      }

      expect(queryDetailsHeading()).toBeNull();
      expect(dockTabs()).toEqual([...ALWAYS_THERE, "Run"]);
      expect(shownTab()).toBe("Workloads");
      expect(editorHeading("Steady")).toBeTruthy();
      expect(picked()).toBe("steady");
    },
  );

  // Fails if the tab's editor still has a Close, or Escape in it clears
  // the selection, as the dock's editor did before the Workloads tab.
  it("has no Close of its own, and Escape in it leaves the selection", () => {
    renderProject();
    openSteady();
    const panel = dockPanel("Workloads");
    expect(within(panel).queryByRole("button", { name: /^Close/ })).toBeNull();

    fireEvent.keyDown(editorHeading("Steady"), { key: "Escape" });

    expect(detailsHeading().textContent).toBe("Steady · Workload");
  });

  // Fails if Fold doesn't hide the editor and keep the Unfold button, or if
  // folding unmounts the editor (`{!folded && ...}` for `hidden`), which
  // loses the draft typed into Duration.
  it("folds to one line and unfolds with the draft still there", () => {
    renderProject();
    openSteady();
    const open = dock();
    const duration = within(open).getByRole("textbox", { name: "Duration" });
    fireEvent.change(duration, { target: { value: "abc" } });

    fireEvent.click(
      within(open).getByRole("button", { name: "Fold the dock" }),
    );

    const unfold = within(open).getByRole("button", {
      name: "Unfold the dock",
    });
    expect(unfold.getAttribute("aria-expanded")).toBe("false");
    expect(within(open).queryByRole("tab")).toBeNull();
    expect(
      within(open).queryByRole("textbox", { name: "Duration" }),
    ).toBeNull();
    fireEvent.click(unfold);
    const again = within(open).getByRole("textbox", { name: "Duration" });
    expect(again).toBe(duration);
    expect((again as HTMLInputElement).value).toBe("abc");
  });

  // Fails if folding unmounts the Run overlay, so the charts are drawn
  // afresh on Unfold, or Run doesn't unfold a folded dock.
  it("keeps the charts mounted while folded, and Run unfolds it", async () => {
    const shown = renderProject();
    await runASecond(shown);
    const [chart] = dock().querySelectorAll("figure");
    const fold = () => {
      fireEvent.click(
        within(dock()).getByRole("button", { name: "Fold the dock" }),
      );
    };
    fold();
    expect(within(dock()).queryByRole("figure")).toBeNull();

    fireEvent.click(
      within(dock()).getByRole("button", { name: "Unfold the dock" }),
    );
    expect(within(dock()).getAllByRole("figure")[0]).toBe(chart);
    fold();
    clickRun();
    expect(shownTab()).toBe("Run");
    expect(
      within(dock()).queryByRole("button", { name: "Unfold the dock" }),
    ).toBeNull();
  });

  // Fails if selecting the already-selected workload leaves a folded dock
  // folded, so its editor stays hidden.
  it("unfolds when the same workload is selected again", () => {
    renderProject();
    openSteady();
    const open = dock();
    fireEvent.click(
      within(open).getByRole("button", { name: "Fold the dock" }),
    );

    pressEdit();

    expect(
      within(open).getByRole("textbox", { name: "Duration" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(detailsHeading());
  });

  // Fails if a narrow window's dock leaves out a tab that's always there,
  // as a wide window's does.
  it("shows Library, Components, Workflows, and Workloads in a narrow window with nothing selected", () => {
    renderProject({ width: "narrow" });

    expect(dockTabs()).toEqual(ALWAYS_THERE);
  });
});

describe("OpenedProject's run group", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the run group leaves the end of the dock's tab strip in a
  // wide window, or splits: the picker, Run, Stop, and the verdict are one
  // unit (UX §5 rule 6). Rule 5's pick is in the workloads' tests.
  it("sits whole at the end of the dock's tab strip", async () => {
    const shown = renderProject();
    await runASecond(shown);

    const group = runGroup();
    expect(dock().contains(group)).toBe(true);
    expect(bar().contains(group)).toBe(false);
    const strip = within(dock()).getByRole("tablist").parentElement;
    expect(strip?.contains(group)).toBe(true);
    const inGroup = within(group);
    expect(inGroup.getByRole("combobox", { name: "Workload" })).toBeTruthy();
    expect(inGroup.getByRole("button", { name: "Run" })).toBeTruthy();
    expect(inGroup.getByRole("button", { name: "Stop" })).toBeTruthy();
    expect(groupVerdict()).toBeTruthy();
  });

  // Fails if Fold leaves its place right after the tabs, before the run
  // group, folded or not: the focus would reach the strip's controls out of
  // the order they're seen in, with the run group wrapping to its own row.
  it("follows the tabs and Fold, folded or not", () => {
    renderProject();
    const fold = () =>
      within(dock()).getByRole("button", { name: /^(Fold|Unfold) the dock$/ });
    const before = (first: Element, second: Element) =>
      (first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
      0;
    expect(before(within(dock()).getByRole("tablist"), fold())).toBe(true);
    expect(before(fold(), runGroup())).toBe(true);

    fireEvent.click(fold());

    expect(before(fold(), runGroup())).toBe(true);
  });

  // Fails if folding the dock hides the run group with the tabs (rule 6:
  // Run and the verdict are always on screen).
  it("stays when the dock folds", async () => {
    const shown = renderProject();
    await runASecond(shown);

    fireEvent.click(
      within(dock()).getByRole("button", { name: "Fold the dock" }),
    );

    expect(within(dock()).queryByRole("tab")).toBeNull();
    expect(
      within(runGroup()).getByRole("button", { name: "Run" }),
    ).toBeTruthy();
    expect(groupVerdict()).toBeTruthy();
  });

  // Fails if the run group isn't in the top bar below the wide breakpoint,
  // or comes before the settings menu there (it's the bar's own row, after
  // the first), or is ever in both places, on either side of it.
  it("moves to the top bar in a narrow window, and back, never in both", () => {
    const { resize } = renderProject();
    expect(screen.getAllByRole("group", { name: "Run" })).toHaveLength(1);

    act(() => {
      resize("narrow");
    });

    expect(screen.getAllByRole("group", { name: "Run" })).toHaveLength(1);
    expect(bar().contains(runGroup())).toBe(true);
    expect(dock().contains(runGroup())).toBe(false);
    // After the settings menu, on the bar's row of its own, so the focus
    // goes through the bar's first row before it.
    const settings = within(bar()).getByRole("button", { name: /settings/i });
    expect(
      settings.compareDocumentPosition(runGroup()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    act(() => {
      resize("wide");
    });
    expect(screen.getAllByRole("group", { name: "Run" })).toHaveLength(1);
    expect(dock().contains(runGroup())).toBe(true);
  });
});

describe("OpenedProject's run evidence", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the run's explanation still draws the totals or a chart, or
  // the dock draws a chart twice or leaves one out.
  it("draws each chart once, in the dock, and none in the inspector, wide", async () => {
    const shown = renderProject();
    await runASecond(shown);

    expect(inspector().querySelectorAll("table, figure")).toHaveLength(0);
    const figures = [...document.querySelectorAll("figure")];
    expect(figures).toHaveLength(4);
    expect(figures.every((figure) => dock().contains(figure))).toBe(true);
    expect(
      within(dockPanel("Run")).getByRole("table", {
        name: "Requests (run totals)",
      }),
    ).toBeTruthy();
  });

  // Fails if the narrow window's inspector draws the totals or a chart, or
  // the dock doesn't follow the inspector, with its tabs, in page order.
  it("draws each chart once, in the dock after the inspector, narrow", async () => {
    const shown = renderProject({ width: "narrow" });
    await runASecond(shown);

    const runPanel = screen.getByRole("region", { name: "Inspector" });
    expect(runPanel.querySelectorAll("table, figure")).toHaveLength(0);
    expect(document.querySelectorAll("figure")).toHaveLength(4);
    expect(dock().querySelectorAll("figure")).toHaveLength(4);
    expect(dockTabs()).toEqual([...ALWAYS_THERE, "Run"]);
    expect(
      runPanel.compareDocumentPosition(dock()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
