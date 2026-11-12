// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import type {
  ProfilePoint,
  Project,
  Workload,
} from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { revealButton } from "./testing/canvas-panels";
import {
  clickRun,
  renderOpenedProject as renderProject,
  savedRecord,
  statusRegions,
} from "./testing/render-opened-project";

const [sampleWorkload] = sampleRecord.project.workloads;
if (sampleWorkload === undefined) throw new Error("The sample has a workload");
const steady: Workload = sampleWorkload;

/** Points as [seconds, requests/s] pairs. */
function points(...pairs: [number, number][]): ProfilePoint[] {
  return pairs.map(([sec, requestsPerSec]) => ({
    atMs: sec * 1000,
    requestsPerSec,
  }));
}

const lunch = points([0, 200], [10, 200], [20, 2000], [40, 2000], [50, 200]);

/** The sample with "Steady", and "Lunch rush" with this profile, 60 s long. */
function projectWith(profile: ProfilePoint[]): Project {
  return {
    ...sampleRecord.project,
    workloads: [
      steady,
      {
        ...steady,
        id: "lunch",
        name: "Lunch rush",
        durationMs: 60_000,
        profile,
      },
    ],
  };
}

function select(name: string): void {
  const button = revealButton(new RegExp(`^${name}`));
  button.focus();
  fireEvent.click(button);
}

function details(): HTMLElement {
  return screen.getByRole("tabpanel", { name: "Details" });
}

function times(): HTMLInputElement[] {
  return within(details()).queryAllByRole("textbox", { name: "Time" });
}

function rates(): HTMLInputElement[] {
  return within(details()).queryAllByRole("textbox", { name: "Rate" });
}

/** The table's points as [seconds, requests/s] pairs, as the fields show them. */
function table(): [number, number][] {
  const rateValues = rates().map((input) => Number(input.value));
  return times().map((input, i) => [Number(input.value), rateValues[i] ?? NaN]);
}

function addPoint(): HTMLElement {
  return within(details()).getByRole("button", { name: "Add point" });
}

function removeButton(point: number): HTMLElement {
  return within(details()).getByRole("button", {
    name: `Remove point ${String(point)}`,
  });
}

function undoButton(): HTMLElement {
  return screen.getByRole("button", { name: /^Undo\b/ });
}

function setField(input: HTMLInputElement, text: string): void {
  input.focus();
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

/** The field's message: the first thing its description points at, if it is one. */
function messageOf(input: HTMLInputElement): string | undefined {
  if (input.getAttribute("aria-invalid") !== "true") return undefined;
  const [first] = (input.getAttribute("aria-describedby") ?? "").split(" ");
  return document.getElementById(first ?? "")?.textContent ?? undefined;
}

function rowOf(point: number): HTMLElement {
  return within(details())
    .getByRole("rowheader", { name: `Point ${String(point)}` })
    .closest("tr") as HTMLElement;
}

describe("OpenedProject's editing a workload's profile", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if "Add point" doesn't append 10 s after the last point at its
  // rate, doesn't take the focus to the new time field, or isn't one named step.
  it("adds a point 10 s after the last, focuses its time, and names the step", async () => {
    const { projects } = renderProject({
      project: projectWith(points([0, 200])),
    });
    select("Lunch rush");

    fireEvent.click(addPoint());

    await savedRecord(
      projects,
      (r) => r.project.workloads[1]?.profile.length === 2,
    );
    expect(table()).toEqual([
      [0, 200],
      [10, 200],
    ]);
    expect(document.activeElement).toBe(times()[1]);
    expect(undoButton().textContent).toBe(
      "Undo add a point at 10 s to Lunch rush's profile",
    );
  });

  // Fails if the Lunch rush profile of UX §2.1 step 7 can't be built from a
  // new workload's one point by adding points and editing them, in order.
  it("builds the Lunch rush profile", () => {
    renderProject({ project: projectWith(points([0, 200])) });
    select("Lunch rush");

    fireEvent.click(addPoint());
    fireEvent.click(addPoint());
    setField(rates()[2] as HTMLInputElement, "2000");
    fireEvent.click(addPoint());
    setField(times()[3] as HTMLInputElement, "40");
    fireEvent.click(addPoint());
    setField(rates()[4] as HTMLInputElement, "200");

    expect(table()).toEqual([
      [0, 200],
      [10, 200],
      [20, 2000],
      [40, 2000],
      [50, 200],
    ]);
    expect(within(details()).getByText("Run ends at 60 s")).toBeTruthy();
  });

  // Fails if a changed time doesn't move the point, rate and all, to its
  // place; the focus doesn't follow it; the move isn't announced; or Undo
  // doesn't put it back.
  it("moves a point to its place when its time changes, and undoes", () => {
    renderProject({ project: projectWith(lunch) });
    select("Lunch rush");

    setField(times()[2] as HTMLInputElement, "45");

    expect(table()).toEqual([
      [0, 200],
      [10, 200],
      [40, 2000],
      [45, 2000],
      [50, 200],
    ]);
    expect(document.activeElement).toBe(times()[3]);
    expect(within(details()).getByRole("status").textContent).toBe(
      "Moved to row 4 of 5.",
    );
    expect(undoButton().textContent).toBe(
      "Undo change Lunch rush's point at 20 s to 45 s",
    );
    fireEvent.click(undoButton());
    expect(table()).toEqual([
      [0, 200],
      [10, 200],
      [20, 2000],
      [40, 2000],
      [50, 200],
    ]);
  });

  // Fails if a time that keeps the point in its row is announced as a move.
  it("says nothing of a move when the row didn't change", () => {
    renderProject({ project: projectWith(lunch) });
    select("Lunch rush");

    setField(times()[2] as HTMLInputElement, "25");

    expect(table()[2]).toEqual([25, 2000]);
    expect(within(details()).getByRole("status").textContent).toBe("");
  });

  // Fails if a rate change isn't one step named for it, or moves the point.
  it("changes a rate in place, as one named step", () => {
    renderProject({ project: projectWith(lunch) });
    select("Lunch rush");

    setField(rates()[4] as HTMLInputElement, "300");

    expect(table()[4]).toEqual([50, 300]);
    expect(undoButton().textContent).toBe(
      "Undo change Lunch rush's rate at 50 s to 300 requests/s",
    );
  });

  // Fails if a duplicate time, a negative time, or a negative rate is saved
  // or loses its message; or Escape saves a draft instead of putting back.
  it("refuses a duplicate time and a negative number, and Escape saves nothing", () => {
    renderProject({ project: projectWith(lunch) });
    select("Lunch rush");

    setField(times()[2] as HTMLInputElement, "40");
    expect(messageOf(times()[2] as HTMLInputElement)).toBe(
      "Another point is already at 40 s.",
    );
    setField(times()[3] as HTMLInputElement, "-1");
    expect(messageOf(times()[3] as HTMLInputElement)).toBe(
      "Time can't be negative.",
    );
    setField(rates()[1] as HTMLInputElement, "-5");
    expect(messageOf(rates()[1] as HTMLInputElement)).toBe(
      "Rate can't be negative.",
    );

    expect(table()[1]).toEqual([10, -5]);
    fireEvent.keyDown(times()[2] as HTMLInputElement, { key: "Escape" });
    expect((times()[2] as HTMLInputElement).value).toBe("20");
    expect(
      screen
        .queryByRole("button", { name: /^Undo\b/ })
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
  });

  // Fails if Remove doesn't move the focus to the next row's time field, or
  // to "Add point" after the last; or Undo doesn't restore the point at its
  // place and rate.
  it("removes a point, moves the focus on, and undoes", () => {
    renderProject({ project: projectWith(lunch) });
    select("Lunch rush");

    fireEvent.click(removeButton(2));
    expect(table()).toEqual([
      [0, 200],
      [20, 2000],
      [40, 2000],
      [50, 200],
    ]);
    expect(document.activeElement).toBe(times()[1]);
    expect(undoButton().textContent).toBe(
      "Undo remove the point at 10 s from Lunch rush's profile",
    );
    fireEvent.click(removeButton(4));
    expect(document.activeElement).toBe(addPoint());
    fireEvent.click(undoButton());
    fireEvent.click(undoButton());

    expect(table()).toEqual([
      [0, 200],
      [10, 200],
      [20, 2000],
      [40, 2000],
      [50, 200],
    ]);
  });

  // Fails if the only point's Remove removes it, or is silent about why.
  it("makes the only point's Remove unusable, and says why", () => {
    renderProject({ project: projectWith(points([0, 200])) });
    select("Lunch rush");

    const remove = removeButton(1);
    fireEvent.click(remove);

    expect(table()).toEqual([[0, 200]]);
    expect(remove.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(
      remove.getAttribute("aria-describedby") ?? "",
    );
    expect(reason?.textContent).toBe("A profile needs at least one point.");
  });

  // Fails if shortening the duration doesn't mark the point past the new end,
  // or marks one the run still reaches.
  it("marks a point past a shortened run's end", () => {
    renderProject({ project: projectWith(lunch) });
    select("Lunch rush");

    setField(
      within(details()).getByRole("textbox", { name: "Duration" }),
      "45",
    );

    expect(rowOf(5).textContent).toContain("After the run's end (45 s)");
    expect(rowOf(4).textContent).not.toContain("After the run's end");
    expect(within(details()).getByText("Run ends at 45 s")).toBeTruthy();
  });

  // Fails if a stored profile's issues don't show on their rows, or the
  // screen can't fix each: an empty profile, two points at one time, and a
  // negative rate.
  it("shows a stored profile's issues on their rows, and fixes them", () => {
    renderProject({
      project: projectWith(points([0, 100], [10, 1], [10, 2], [30, -5])),
    });
    select("Lunch rush");

    expect(rowOf(3).textContent).toContain("The profile's times must increase");
    expect(rowOf(4).textContent).toContain("rates can't be negative");
    setField(times()[1] as HTMLInputElement, "20");
    setField(rates()[3] as HTMLInputElement, "5");

    expect(table()).toEqual([
      [0, 100],
      [10, 2],
      [20, 1],
      [30, 5],
    ]);
    expect(details().textContent).not.toContain("must increase");
    expect(details().textContent).not.toContain("can't be negative");
  });

  // Fails if an empty stored profile shows no way to add its first point.
  it("lets an empty stored profile get its first point", () => {
    renderProject({ project: projectWith([]) });
    select("Lunch rush");

    expect(details().textContent).toContain("The profile has no points.");
    fireEvent.click(addPoint());

    expect(table()).toEqual([[0, 100]]);
  });

  // Fails if editing the profile of a workload that didn't run marks the
  // run out of date, or editing the one that ran leaves it current.
  it("marks the run out of date only when the workload that ran is edited", async () => {
    const { runner } = renderProject({ project: projectWith(lunch) });
    clickRun();
    runner.send(sampleSnapshot({ second: 1 }));
    await runner.finish();
    select("Lunch rush");

    fireEvent.click(addPoint());
    expect(statusRegions()[1].textContent).toBe("");
    select("Steady");
    fireEvent.click(addPoint());

    expect(statusRegions()[1].textContent).toBe("Out of date");
  });
});
