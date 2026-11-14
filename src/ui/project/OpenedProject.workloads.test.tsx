// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import type { Project, Workload } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { revealButton } from "./testing/canvas-panels";
import {
  detailsHeading,
  queryDetailsHeading,
  renderOpenedProject as renderProject,
} from "./testing/render-opened-project";

const [steady] = sampleRecord.project.workloads;
if (steady === undefined) throw new Error("The sample has a workload");

/** A second workload, with an empty mix, so it can't run. */
const broken: Workload = {
  ...steady,
  id: "broken",
  name: "Broken",
  mix: [],
  durationMs: 4_000,
  profile: [
    { atMs: 0, requestsPerSec: 5 },
    { atMs: 6_000, requestsPerSec: 9 },
  ],
};

const twoWorkloads: Project = {
  ...sampleRecord.project,
  workloads: [steady, broken],
};

/** Clicks a button, as the keyboard would: a row in the Workflows panel. */
function selectFromList(name: string): HTMLElement {
  const button = revealButton(name);
  button.focus();
  fireEvent.click(button);
  return button;
}

function picker(): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>("combobox", { name: "Workload" });
}

function pickedName(): string | undefined {
  return picker().selectedOptions[0]?.textContent ?? undefined;
}

/** Presses the project bar's Edit, with the focus on it first. */
function pressEdit(): HTMLElement {
  const edit = screen.getByRole("button", { name: "Edit" });
  edit.focus();
  fireEvent.click(edit);
  return edit;
}

/** A table's rows as the text of their cells. */
function rowsOf(table: HTMLElement | undefined): (string | null)[][] {
  if (table === undefined) throw new Error("expected a table");
  return within(table)
    .getAllByRole("row")
    .map((row) =>
      [...row.querySelectorAll("th, td")].map((cell) => cell.textContent),
    );
}

describe("OpenedProject's workloads", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the list leaves a workload out, reorders them, or drops the
  // problem count of the one with an issue.
  it("lists the workloads in order, with a problem count where there is one", () => {
    renderProject({ project: twoWorkloads });

    revealButton("Steady");
    const list = screen.getByRole("list", { name: "Workloads" });

    expect(
      within(list)
        .getAllByRole("button")
        .map((row) => row.textContent),
    ).toEqual(["Steady", "Broken · 1 problem"]);
  });

  // Fails if a project without workloads shows an empty list, or loses
  // the line on what a workload is, or still offers Edit.
  it("says what a workload is when there are none, and offers no Edit", () => {
    renderProject({ project: { ...sampleRecord.project, workloads: [] } });

    revealButton("Add workflow");

    expect(screen.queryByRole("list", { name: "Workloads" })).toBeNull();
    expect(
      screen.getByText(
        "No workloads yet. A workload says how much traffic your workflows get, and for how long.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  // Fails if a row doesn't open the workload in Details with the focus on
  // its heading, doesn't pick it in the project bar, isn't marked while
  // selected, or Escape leaves Details showing or drops the focus instead
  // of returning it to the row.
  it("opens a workload from its row and picks it in the bar; Escape returns to the row", () => {
    renderProject({ project: twoWorkloads });

    const row = selectFromList("Broken · 1 problem");

    expect(document.activeElement).toBe(detailsHeading());
    expect(detailsHeading().textContent).toBe("Broken · Workload");
    expect(pickedName()).toBe("Broken (can't run yet)");
    expect(row.getAttribute("aria-current")).toBe("true");
    fireEvent.keyDown(detailsHeading(), { key: "Escape" });
    expect(queryDetailsHeading()).toBeNull();
    expect(document.activeElement).toBe(row);
    expect(row.getAttribute("aria-current")).toBeNull();
  });

  // Fails if Edit selects a workload other than the picked one, or Escape
  // returns the focus anywhere but Edit.
  it("opens the picked workload from Edit; Escape returns to Edit", () => {
    renderProject({ project: twoWorkloads });
    fireEvent.change(picker(), { target: { value: "broken" } });
    expect(queryDetailsHeading()).toBeNull();

    const edit = pressEdit();

    expect(detailsHeading().textContent).toBe("Broken · Workload");
    expect(document.activeElement).toBe(detailsHeading());
    fireEvent.keyDown(detailsHeading(), { key: "Escape" });
    expect(document.activeElement).toBe(edit);
  });

  // Fails if picking in the bar selects the workload or changes what
  // Details shows: the links are one way (UX §2.7 step 1).
  it("picking in the bar changes no selection", () => {
    renderProject({ project: twoWorkloads });
    selectFromList("Steady");

    fireEvent.change(picker(), { target: { value: "broken" } });

    expect(detailsHeading().textContent).toBe("Steady · Workload");
    expect(pickedName()).toBe("Broken (can't run yet)");
  });

  // Fails if a change to the project picks the selected workload again,
  // undoing a pick made in the bar since.
  it("doesn't pick the selected workload again when the project changes", () => {
    const { change } = renderProject({ project: twoWorkloads });
    selectFromList("Steady");
    fireEvent.change(picker(), { target: { value: "broken" } });

    change({ ...twoWorkloads, name: "Renamed" });

    expect(pickedName()).toBe("Broken (can't run yet)");
  });

  // Fails if Details drops the duration, the seed, a mix row's name or
  // share, the total, or a profile row, or shows an id for a workflow.
  it("reads a workload's values, mix, and profile", () => {
    renderProject({ project: twoWorkloads });

    selectFromList("Steady");

    const details = screen.getByRole("region", { name: "Dock" });
    expect(
      within(details).getByRole<HTMLInputElement>("textbox", {
        name: "Duration",
      }).value,
    ).toBe("5");
    expect(
      within(details).getByRole<HTMLInputElement>("textbox", { name: "Seed" })
        .value,
    ).toBe("1");
    const [mix, profile] = within(details).getAllByRole("table");
    expect(rowsOf(mix)).toEqual([
      ["Workflow", "Weight", "Share", "Actions"],
      ["Read item", "Weight", "100.0%", "Remove from mix"],
    ]);
    expect(
      within(details).getByRole<HTMLInputElement>("textbox", { name: "Weight" })
        .value,
    ).toBe("1");
    expect(within(details).getByText("Shares total 100%")).toBeTruthy();
    const [heads] = rowsOf(profile);
    expect(heads).toEqual([
      "Point",
      "Time (s)",
      "Rate (requests/s)",
      "Notes",
      "Actions",
    ]);
    expect(
      within(profile as HTMLElement)
        .getAllByRole<HTMLInputElement>("textbox")
        .map((input) => input.value),
    ).toEqual(["0", "20"]);
    expect(details.textContent).not.toMatch(/\bread\b/);
  });

  // Fails if a stored empty mix isn't said once on the mix, and in the bar, or
  // a point past the run's end has no note, or a note lands on another row.
  it("shows a hand-broken workload's problem and its notes where they are", () => {
    renderProject({ project: twoWorkloads });
    selectFromList("Broken · 1 problem");

    const details = screen.getByRole("region", { name: "Dock" });

    expect(within(details).queryByText("The mix has no workflows.")).toBeNull();
    expect(
      within(details).getByText(
        "No workflows in the mix. A workload with an empty mix can't run.",
      ),
    ).toBeTruthy();
    expect(within(details).queryByText(/Shares total/)).toBeNull();
    const [profile] = within(details).getAllByRole("table");
    expect(rowsOf(profile).map((row) => row[3])).toEqual([
      "Notes",
      "",
      "After the run's end (4 s). Arrivals follow the line toward this point, and the run stops at 4 s.",
    ]);
    expect(
      screen.getByText(/^Broken can't run yet: The mix has no workflows\.$/),
    ).toBeTruthy();
  });
});
