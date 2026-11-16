// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { preloadBeforeAll } from "../shared/testing/preload-before-all";
import { revealButton } from "./testing/canvas-panels";
import {
  barVerdict,
  clickRun,
  detailsHeading,
  inspector,
  overview,
  queryRunExplanation,
  renderOpenedProject as renderProject,
  runExplanation,
  selectTheRun,
  type RenderedProject,
} from "./testing/render-opened-project";

// UX design §5's rules and limit about selecting the run, as the screen
// follows them; the state's transitions are tested in
// `screen/screen-state.test.ts`.

/** A project that has run to the end, with the table throttling a read. */
async function renderRun(): Promise<RenderedProject> {
  const rendered = renderProject();
  clickRun();
  await runToTheEnd(rendered);
  return rendered;
}

/** Sends a second of the table throttling a read, and ends the run. */
async function runToTheEnd({ runner }: RenderedProject): Promise<void> {
  runner.send(
    sampleSnapshot({
      second: 1,
      read: { started: 1, failed: 1, failures: { "table: throttled": 1 } },
      table: { arrivals: 1, rejected: 1 },
    }),
  );
  await runner.finish();
}

/** The run's explanation's heading, which takes the focus on a verdict. */
function runHeading(): HTMLElement {
  return within(runExplanation()).getByRole("heading", { name: "Run: Steady" });
}

/** The overview's verdict, which selects the run. */
function overviewVerdict(): HTMLElement {
  const latest = within(overview()).getByRole("region", { name: "Latest run" });
  return within(latest).getByRole("button");
}

/** The run's first finding's button, which starts with its number. */
function firstFinding(): HTMLElement {
  const [first] = within(runExplanation()).getAllByRole("button", {
    name: /^\d+(\.\d+)*\. /,
  });
  if (first === undefined) throw new Error("The run has a finding");
  return first;
}

function selectFunction(): HTMLElement {
  const button = revealButton(/^Function \(Lambda\)/);
  button.focus();
  fireEvent.click(button);
  return button;
}

describe("OpenedProject's run, as a selection", () => {
  preloadBeforeAll(() => import("../diagram/DiagramCanvas"));
  preloadBeforeAll(() => import("../charts/ChartPlot"));
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if, before any run, the overview is missing what the project
  // is and holds, or something can select the run: a verdict in the run group
  // or the overview, or the run's explanation itself (the limit "no run").
  it("shows the overview before any run, with nothing that selects the run", () => {
    renderProject();

    const shown = overview();
    expect(within(shown).getByText("A small project for tests.")).toBeTruthy();
    expect(
      within(shown).getByText("3 components, 1 workflow, 1 workload."),
    ).toBeTruthy();
    expect(
      within(shown).queryByRole("region", { name: "Latest run" }),
    ).toBeNull();
    expect(() => barVerdict()).toThrow();
    expect(queryRunExplanation()).toBeNull();
  });

  // Fails if Run doesn't select the run: the overview stays, or the run's
  // explanation doesn't show (rule 4).
  it("selects the run on Run, so the inspector explains it", async () => {
    await renderRun();

    expect(runExplanation()).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Overview" })).toBeNull();
  });

  // Fails if Run, with a thing selected, keeps it rather than selecting
  // the run.
  it("selects the run on Run, from a thing", async () => {
    const { runner } = await renderRun();
    selectFunction();

    clickRun();
    await runner.finish();

    expect(runExplanation()).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Details" })).toBeNull();
  });

  // Fails if a new run keeps the old run's finding selected, rather than
  // selecting the new run. The new run has the same finding, so a kept
  // selection would still mark its button.
  it("selects the new run on Run, from a finding of the old one", async () => {
    const rendered = await renderRun();
    fireEvent.click(firstFinding());
    expect(firstFinding().getAttribute("aria-current")).toBe("true");

    clickRun();
    await runToTheEnd(rendered);

    expect(firstFinding().getAttribute("aria-current")).toBeNull();
  });

  // Fails if nothing selected after a run shows the run's explanation, or
  // the overview has no verdict, or the overview's verdict doesn't select
  // the run and move the focus to its heading.
  it("shows the verdict in the overview after a run, which selects the run", async () => {
    await renderRun();
    fireEvent.click(document.querySelector(".react-flow__pane") as Element);
    expect(queryRunExplanation()).toBeNull();
    expect(overviewVerdict().textContent).toMatch(/^Failing/);

    fireEvent.click(overviewVerdict());

    expect(document.activeElement).toBe(runHeading());
    expect(screen.queryByRole("region", { name: "Overview" })).toBeNull();
  });

  // Fails if a verdict's name says only the verdict, not that it shows the
  // run, in the run group or the overview.
  it("names each verdict as showing the run", async () => {
    await renderRun();
    expect(barVerdict().textContent).toMatch(/^Failing.*\. Show the run$/);
    fireEvent.click(document.querySelector(".react-flow__pane") as Element);

    expect(overviewVerdict().textContent).toMatch(/^Failing.*\. Show the run$/);
  });

  // Fails if the run group's verdict doesn't select the run again from a
  // thing, or leaves the focus off the run's heading.
  it("selects the run again from the run group's verdict", async () => {
    await renderRun();
    selectFunction();
    expect(detailsHeading()).toBeTruthy();

    selectTheRun();

    expect(document.activeElement).toBe(runHeading());
    expect(screen.queryByRole("region", { name: "Details" })).toBeNull();
  });

  // Fails if a click on a box, with the run selected, doesn't take you to
  // the box.
  it("moves from the run to a thing on a click", async () => {
    await renderRun();

    selectFunction();

    expect(detailsHeading().textContent).toBe("Function · Lambda");
    expect(queryRunExplanation()).toBeNull();
  });

  // Fails if × or Escape, with the run selected, leaves it selected, so the
  // overview doesn't show, or doesn't return the focus to the verdict that
  // selected it.
  it.each(["×", "Escape"])(
    "clears the run on %s, showing the overview",
    async (how) => {
      await renderRun();
      barVerdict().focus();
      selectTheRun();

      if (how === "Escape") fireEvent.keyDown(runHeading(), { key: "Escape" });
      else
        fireEvent.click(
          within(inspector()).getByRole("button", { name: "Close the run" }),
        );

      expect(queryRunExplanation()).toBeNull();
      expect(overview()).toBeTruthy();
      expect(document.activeElement).toBe(barVerdict());
    },
  );
});
