// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import type { Project } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { revealButton } from "./testing/canvas-panels";
import {
  clickRun,
  detailsHeading,
  dock,
  dockPanel,
  dockTabs,
  inspector,
  queryDock,
  renderOpenedProject as renderProject,
  type RenderedProject,
} from "./testing/render-opened-project";

const [steady] = sampleRecord.project.workloads;
if (steady === undefined) throw new Error("The sample has a workload");

/** Two workloads, "Steady" and "Spike", so a pick can differ from the first. */
const twoWorkloads: Project = {
  ...sampleRecord.project,
  workloads: [steady, { ...steady, id: "spike", name: "Spike" }],
};

/** Selects a workload from its row in the "Workloads" list. */
function openWorkload(name: string): void {
  const row = revealButton(name);
  row.focus();
  fireEvent.click(row);
}

function openSteady(): void {
  openWorkload("Steady");
}

/** The editor's heading in the dock, the workload's name and its kind. */
function workloadHeading(): HTMLElement {
  return within(dock()).getByRole("heading", { level: 4, name: /· Workload$/ });
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

  // Fails if the dock shows with no run and nothing selected, or a workload
  // doesn't open in it, in a tab labelled with its name.
  it("shows nothing until a workload is selected, then its tab", () => {
    renderProject();
    expect(queryDock()).toBeNull();

    openSteady();

    expect(dockTabs()).toEqual(["Workload: Steady"]);
    expect(workloadHeading().textContent).toBe("Steady · Workload");
  });

  // Fails if the workload's editor stays in the inspector's Details too, or
  // the inspector doesn't close when a workload opens (UX §5).
  it("closes the inspector, and leaves the workload out of Details", () => {
    renderProject();
    const toggle = screen.getByRole("button", { name: "Close the inspector" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    openSteady();

    expect(
      screen
        .getByRole("button", { name: "Open the inspector" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      screen.queryAllByRole("heading", { level: 4, name: /· Workload$/ }),
    ).toHaveLength(1);
  });

  // Fails if the Run overlay waits for something other than the run
  // starting (such as `meaning`), or showing it moves the focus off the
  // run's controls.
  it("shows a Run tab once a run starts, with the focus left on the bar", () => {
    renderProject();
    const run = screen.getByRole("button", { name: "Run" });
    run.focus();

    fireEvent.click(run);

    expect(dockTabs()).toEqual(["Run"]);
    expect(shownTab()).toBe("Run");
    expect(dock().contains(document.activeElement)).toBe(false);
  });

  // Fails if the overlays' tabs aren't in the map's order, Run first, or the
  // workload's tab doesn't show on its selection while a run is there.
  it("holds Run and the workload together, on the workload's", async () => {
    const shown = renderProject();
    await runASecond(shown);

    openSteady();

    expect(dockTabs()).toEqual(["Run", "Workload: Steady"]);
    expect(shownTab()).toBe("Workload: Steady");
    expect(document.activeElement).toBe(workloadHeading());
  });

  // Fails if the tab's label is a copy taken when the workload opened,
  // rather than its name read from the project as it is.
  it("follows a rename in the tab's label", () => {
    renderProject();
    openSteady();
    const name = within(dock()).getByRole("textbox", { name: "Name" });

    fireEvent.change(name, { target: { value: "Dinner" } });
    fireEvent.keyDown(name, { key: "Enter" });

    expect(dockTabs()).toEqual(["Workload: Dinner"]);
  });

  // Fails if switching the dock's tabs changes the selection: the workload
  // tab would go, or the bar's pick move back to the first workload.
  it("keeps the workload selected and picked while Run shows", async () => {
    const shown = renderProject({ project: twoWorkloads });
    await runASecond(shown);
    openWorkload("Spike");
    expect(picked()).toBe("spike");

    fireEvent.click(dockTab("Run"));

    expect(shownTab()).toBe("Run");
    expect(dockTabs()).toEqual(["Run", "Workload: Spike"]);
    expect(picked()).toBe("spike");
    fireEvent.click(dockTab("Workload: Spike"));
    expect(workloadHeading().textContent).toBe("Spike · Workload");
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
    fireEvent.click(dockTab("Workload: Steady"));

    const again = within(dock()).getByRole("textbox", { name: "Duration" });
    expect(again).toBe(duration);
    expect((again as HTMLInputElement).value).toBe("abc");
  });

  // Fails if selecting a workload while Run shows leaves Run showing, so the
  // heading's focus request lands in a hidden panel.
  it("shows the workload's tab, focused, when it's selected over Run", async () => {
    const shown = renderProject();
    await runASecond(shown);
    openSteady();
    fireEvent.click(dockTab("Run"));

    openSteady();

    expect(shownTab()).toBe("Workload: Steady");
    expect(document.activeElement).toBe(workloadHeading());
  });

  // Fails if Run while the workload's tab shows leaves it showing, or
  // changes the selection, or moves the focus into the dock.
  it("switches to Run on Run, keeping the selection and the focus", async () => {
    const shown = renderProject();
    await runASecond(shown);
    openSteady();
    const run = screen.getByRole("button", { name: "Run" });
    run.focus();

    fireEvent.click(run);

    expect(shownTab()).toBe("Run");
    expect(dockTabs()).toEqual(["Run", "Workload: Steady"]);
    expect(dock().contains(document.activeElement)).toBe(false);
  });

  // Fails if Close or Escape leaves the workload's tab, or takes the Run
  // tab with it.
  it.each(["Close", "Escape"])(
    "clears the selection on %s, leaving Run showing",
    async (how) => {
      const shown = renderProject();
      await runASecond(shown);
      openSteady();

      const heading = workloadHeading();
      if (how === "Escape") fireEvent.keyDown(heading, { key: "Escape" });
      else
        fireEvent.click(within(dock()).getByRole("button", { name: /^Close/ }));

      expect(dockTabs()).toEqual(["Run"]);
      expect(shownTab()).toBe("Run");
      expect(picked()).toBe("steady");
    },
  );

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
  // folded, so the focus request has no heading to reach.
  it("unfolds when the same workload is selected again", () => {
    renderProject();
    openSteady();
    const open = dock();
    fireEvent.click(
      within(open).getByRole("button", { name: "Fold the dock" }),
    );
    const edit = screen.getByRole("button", { name: "Edit" });
    edit.focus();

    fireEvent.click(edit);

    expect(
      within(open).getByRole("textbox", { name: "Duration" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(workloadHeading());
  });

  // Fails if closing the dock leaves the inspector collapsed.
  it("brings the inspector back when the dock closes", () => {
    renderProject();
    openSteady();

    fireEvent.keyDown(workloadHeading(), { key: "Escape" });

    expect(
      screen
        .getByRole("button", { name: "Close the inspector" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  // Fails if Escape leaves the dock open with no run to show.
  it("closes on Escape when there's no run", () => {
    renderProject();
    openSteady();

    fireEvent.keyDown(workloadHeading(), { key: "Escape" });

    expect(queryDock()).toBeNull();
  });
});

describe("OpenedProject's run evidence", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the inspector's Run tab still draws the totals or a chart, or
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

  // Fails if the narrow window's Run panel still draws the totals or a
  // chart, or the dock doesn't follow the inspector's content, with its
  // tabs, in page order.
  it("draws each chart once, in the dock after the Run panel, narrow", async () => {
    const shown = renderProject({ width: "narrow" });
    await runASecond(shown);

    const runPanel = screen.getByRole("region", { name: "Run" });
    expect(runPanel.querySelectorAll("table, figure")).toHaveLength(0);
    expect(document.querySelectorAll("figure")).toHaveLength(4);
    expect(dock().querySelectorAll("figure")).toHaveLength(4);
    expect(dockTabs()).toEqual(["Run"]);
    expect(
      runPanel.compareDocumentPosition(dock()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
