// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { awsDescribeSelection } from "../../application/testing/aws-describe-selection";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import { RunSimulation } from "../../application/use-cases/run-simulation";
import type { Project } from "../../domain/model/project";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { preloadBeforeAll } from "../shared/testing/preload-before-all";
import { ManualSimulationRunner } from "../run/testing/manual-simulation-runner";
import {
  stubWindowWidth,
  type WindowWidth,
} from "../shared/testing/stub-window-width";
import { OpenedProject } from "./OpenedProject";

const twoWorkloads: Project = {
  ...sampleRecord.project,
  workloads: sampleRecord.project.workloads.flatMap((steady) => [
    steady,
    { ...steady, id: "spike", name: "Spike" },
  ]),
};

interface RenderProjectInput {
  readonly project?: Project;
  readonly width?: WindowWidth;
}

function renderProject({
  project = sampleRecord.project,
  width = "wide",
}: RenderProjectInput = {}) {
  const resize = stubWindowWidth(width);
  const runner = new ManualSimulationRunner();
  const useCases = fakeUseCases({
    runSimulation: new RunSimulation({ runner }),
    describeSelection: awsDescribeSelection(),
  });
  const screenOf = (shown: Project) => (
    <UseCasesProvider useCases={useCases}>
      <OpenedProject record={{ ...sampleRecord, project: shown }} />
    </UseCasesProvider>
  );
  const view = render(screenOf(project));
  /** Hands the open screen a changed project, as an edit will. */
  const change = (changed: Project) => {
    view.rerender(screenOf(changed));
  };
  return { runner, resize, change, ...view };
}

/** The bar's status regions: the run's status, then whether it's out of date. */
function statusRegions(): [HTMLElement, HTMLElement] {
  const [runStatus, outOfDate] = within(bar()).getAllByRole("status");
  if (runStatus === undefined || outOfDate === undefined) {
    throw new Error("the bar should have two status regions");
  }
  return [runStatus, outOfDate];
}

function status(): string | null {
  return statusRegions()[0].textContent;
}

/**
 * Every text the status region commits while `action` runs, in order: what
 * a screen reader could announce, including texts replaced in the same act.
 */
function statusesDuring(action: () => void): (string | null)[] {
  const [region] = statusRegions();
  const observer = new MutationObserver(() => undefined);
  observer.observe(region, {
    subtree: true,
    characterData: true,
    characterDataOldValue: true,
  });
  action();
  // Each record holds the text it replaced; the first replaced the text
  // from before the action.
  const replaced = observer.takeRecords().map((record) => record.oldValue);
  observer.disconnect();
  return [...replaced.slice(1), region.textContent];
}

function requestsSoFar(): (string | null)[] {
  const table = screen.getByRole("table", { name: "Requests (run totals)" });
  const footer = table.querySelector("tfoot tr");
  return [...(footer?.querySelectorAll("th, td") ?? [])].map(
    (cell) => cell.textContent,
  );
}

/** The project bar, named by the project. */
function bar(): HTMLElement {
  return screen.getByRole("region", { name: "Sample project" });
}

/** Clicks a component's or connection's button in the diagram's text version. */
function selectFromText(name: string): HTMLElement {
  const button = screen.getByRole("button", { name });
  button.focus();
  fireEvent.click(button);
  return button;
}

/** The Details heading: the selected item's name and what kind it is. */
function detailsHeading(): HTMLElement {
  return screen.getByRole("heading", { level: 4 });
}

/** The diagram's box for a component, once React Flow has drawn it. */
async function drawnNode(componentId: string): Promise<Element> {
  await waitFor(() => {
    expect(
      document.querySelector(`.react-flow__node[data-id="${componentId}"]`),
    ).not.toBeNull();
  });
  return document.querySelector(
    `.react-flow__node[data-id="${componentId}"]`,
  ) as Element;
}

function selectedTab(): string | null | undefined {
  return screen
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;
}

function clickRun(): void {
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
}

describe("OpenedProject's project bar", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the bar loses the project's name or description, the picker,
  // or Run, or a run started from the bar doesn't fill the Run tab.
  it("shows the project and runs it, filling the Run tab", () => {
    const { runner } = renderProject();
    const inBar = within(bar());
    expect(
      inBar.getByRole("heading", { level: 2, name: "Sample project" }),
    ).toBeTruthy();
    expect(inBar.getByText("A small project for tests.")).toBeTruthy();
    expect(inBar.getByRole("combobox", { name: "Workload" })).toBeTruthy();
    expect(inBar.getByRole("button", { name: "Run" })).toBeTruthy();
    expect(screen.getByText("Nothing has run yet.")).toBeTruthy();

    clickRun();
    runner.send(sampleSnapshot({ second: 1, read: { started: 5 } }));

    const runTab = screen.getByRole("tabpanel", { name: "Run" });
    expect(
      within(runTab).getByRole("table", { name: "Requests (run totals)" }),
    ).toBeTruthy();
    expect(requestsSoFar()).toEqual(["All workflows", "5", "0", "0", "5"]);
  });

  // Fails if the status region mounts with its first text rather than
  // before it: screen readers announce changes only to a region they know.
  it("has its status region in place, empty, before the first run", () => {
    renderProject();

    expect(status()).toBe("");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  // Fails if the status line stops ending with the verdict's title, or a
  // failed request with a cause doesn't turn the verdict to Failing.
  it("fills in totals and charts as snapshots arrive, then finishes", async () => {
    const { runner } = renderProject();

    clickRun();
    expect(status()).toBe("Running Steady… Healthy so far.");
    runner.send(
      sampleSnapshot({ second: 1, read: { started: 5, succeeded: 2 } }),
    );
    // A failure has a cause, as in a real run, so the verdict can find it.
    runner.send(
      sampleSnapshot({
        second: 2,
        read: { started: 3, failed: 1, failures: { "table: throttled": 1 } },
        table: { arrivals: 1, rejected: 1 },
      }),
    );

    expect(requestsSoFar()).toEqual(["All workflows", "8", "2", "1", "5"]);
    expect(screen.getByText("2 of 5 simulated seconds")).toBeTruthy();
    const runTab = screen.getByRole("tabpanel", { name: "Run" });
    expect(within(runTab).getAllByRole("figure")).toHaveLength(4);
    await runner.finish();
    expect(status()).toBe("Finished Steady. Failing so far.");
  });

  // Fails if the progress bar counts snapshots instead of simulated time
  // (simulatedSec returning snapshots.length): it would read 2 of 2.5.
  it("measures progress in simulated time, so a run that ends partway through a second fills the bar", async () => {
    const [steady] = sampleRecord.project.workloads;
    if (steady === undefined) throw new Error("sample has no workload");
    const { runner } = renderProject({
      project: {
        ...sampleRecord.project,
        workloads: [{ ...steady, durationMs: 2_500 }],
      },
    });
    clickRun();

    // The sampler ticks each second, then once more at the duration.
    runner.send(sampleSnapshot({ second: 1 }));
    runner.send({ ...sampleSnapshot({ second: 3 }), endMs: 2_500 });
    await runner.finish();

    const progress = screen.getByRole<HTMLProgressElement>("progressbar");
    expect(screen.getByText("2.5 of 2.5 simulated seconds")).toBeTruthy();
    expect(progress.value).toBe(progress.max);
  });

  // Fails if Stop in the bar doesn't stop the runner, the totals drop what
  // arrived, or the stopped status line loses how far it got or the
  // verdict's title.
  it("stops partway and says how far it got", async () => {
    const { runner } = renderProject();
    clickRun();
    runner.send(sampleSnapshot({ second: 1, read: { started: 5 } }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stop" }));
      await Promise.resolve();
    });

    expect(runner.stopped).toBe(true);
    expect(status()).toBe(
      "Stopped Steady after 1 of 5 simulated seconds. Healthy so far.",
    );
    expect(requestsSoFar()).toEqual(["All workflows", "5", "0", "0", "5"]);
  });

  // Fails if a run that throws doesn't say so in the status line, or the
  // line drops the error's message.
  it("says why a run failed", async () => {
    const { runner } = renderProject();
    clickRun();

    await runner.crash("The simulation Worker failed to start.");

    expect(status()).toBe(
      "Steady failed: Error: The simulation Worker failed to start.",
    );
  });

  // Fails if Run runs another workload than the one picked, the picker
  // stays usable while running, or the status line loses the verdict's title.
  it("runs the workload picked, and locks the picker while it runs", () => {
    const { runner } = renderProject({ project: twoWorkloads });
    const picker = screen.getByRole("combobox", { name: "Workload" });

    fireEvent.change(picker, { target: { value: "spike" } });
    clickRun();

    expect(status()).toBe("Running Spike… Healthy so far.");
    expect((picker as HTMLSelectElement).disabled).toBe(true);
    expect(runner.runs).toBe(1);
  });

  // Fails if Stop is usable when no run is going, Run stays usable while
  // one is, or starting a run moves the focus off Run (as swapping Run for
  // a Stop button would).
  it("offers Stop only while running, without moving the focus", async () => {
    const { runner } = renderProject();
    const run = screen.getByRole("button", { name: "Run" });
    const stop = screen.getByRole("button", { name: "Stop" });
    expect(stop.getAttribute("aria-disabled")).toBe("true");

    run.focus();
    fireEvent.click(run);

    expect(run.getAttribute("aria-disabled")).toBe("true");
    expect(stop.getAttribute("aria-disabled")).toBe("false");
    expect(document.activeElement).toBe(run);
    await runner.finish();
    expect(stop.getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if a late Stop click starts a new run, or the finished status
  // line loses the verdict's title.
  it("ignores a click on Stop that lands after the run ended", async () => {
    // In the browser a busy page delayed Stop clicks until the run had
    // ended; with one Run/Stop button, each late click started a new run.
    const { runner } = renderProject();
    clickRun();
    await runner.finish();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(runner.runs).toBe(1);
    expect(status()).toBe("Finished Steady. Healthy so far.");
  });

  // Fails if the status line pairs a new run with the previous run's
  // verdict while the deferred snapshots catch up: it reads "Running
  // Steady… Failing so far." for a commit, and a screen reader can say so.
  it("never announces the previous run's verdict as a new run starts", async () => {
    const { runner } = renderProject();
    clickRun();
    runner.send(
      sampleSnapshot({
        second: 1,
        read: { started: 1, failed: 1, failures: { "table: throttled": 1 } },
        table: { arrivals: 1, rejected: 1 },
      }),
    );
    await runner.finish();
    expect(status()).toBe("Finished Steady. Failing so far.");

    const statuses = statusesDuring(clickRun);

    // No title until the deferred render reaches the new run.
    expect(statuses).toEqual([
      "Running Steady…",
      "Running Steady… Healthy so far.",
    ]);
  });

  // Fails if useSimulationRun's guard reads the phase instead of its ref:
  // two clicks before a re-render would start two runs.
  it("ignores a second Run that lands before React re-renders", () => {
    // Both clicks in one act(), so the second still sees Run as usable;
    // only the hook's own guard can stop it.
    const { runner } = renderProject();
    const run = screen.getByRole("button", { name: "Run" });

    act(() => {
      fireEvent.click(run);
      fireEvent.click(run);
    });

    expect(runner.runs).toBe(1);
  });

  // Fails if the run outlives the screen now that OpenedProject holds it:
  // drop useSimulationRun's abort on unmount and the runner never stops.
  it("stops the run when the user leaves the screen", () => {
    const { runner, unmount } = renderProject();
    clickRun();

    unmount();

    expect(runner.stopped).toBe(true);
  });

  // Fails if a project without workloads gets a Run button, or the bar
  // stops saying why there's none.
  it("says so in the bar when the project has no workloads", () => {
    renderProject({ project: { ...sampleRecord.project, workloads: [] } });

    expect(
      within(bar()).getByText("This project has no workloads to run."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });
});

/** The sample project with its table component renamed to `name`. */
function withTableNamed(name: string): Project {
  const { architecture } = sampleRecord.project;
  const components = architecture.components.map((component) =>
    component.id === "table" ? { ...component, name } : component,
  );
  return {
    ...sampleRecord.project,
    architecture: { ...architecture, components },
  };
}

/** A second of the sample run in which the table throttles a read. */
function throttledSecond(second: number) {
  return sampleSnapshot({
    second,
    read: { started: 1, failed: 1, failures: { "table: throttled": 1 } },
    table: { arrivals: 1, rejected: 1 },
  });
}

const EARLIER_VERSION =
  "This run is of an earlier version of the project. Run again to see your changes.";

function runTab(): HTMLElement {
  return screen.getByRole("tabpanel", { name: "Run" });
}

describe("OpenedProject's run when the project changes", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if useRunFindings words the findings from the project as it is
  // now, not the run's copy: they would read "Orders".
  it("words the run's findings from the project it ran", async () => {
    const { runner, change } = renderProject();
    clickRun();
    runner.send(throttledSecond(1));
    await runner.finish();
    expect(within(runTab()).queryAllByText(/Table/).length).toBeGreaterThan(0);

    change(withTableNamed("Orders"));

    expect(within(runTab()).queryAllByText(/Table/).length).toBeGreaterThan(0);
    expect(within(runTab()).queryByText(/Orders/)).toBeNull();
  });

  // Fails if a change to the project after a run doesn't mark it out of
  // date in the bar and the Run tab, or the findings go with it.
  it("says the run is out of date, and keeps its findings", async () => {
    const { runner, change } = renderProject();
    clickRun();
    runner.send(throttledSecond(1));
    await runner.finish();
    expect(within(runTab()).queryByText(EARLIER_VERSION)).toBeNull();

    change(withTableNamed("Orders"));

    expect(statusRegions()[1].textContent).toBe("Out of date");
    expect(within(runTab()).getByText(EARLIER_VERSION)).toBeTruthy();
    expect(status()).toBe("Finished Steady. Failing so far.");
    expect(
      within(runTab()).getByRole("heading", { name: "Failing so far" }),
    ).toBeTruthy();
  });

  // Fails if the run picks up the changed project while it runs (the
  // later throttle would be worded "Orders"), or isn't shown out of date
  // until it ends.
  it("shows a run out of date as soon as the project changes, and finishes it with its copy", async () => {
    const { runner, change } = renderProject();
    clickRun();
    runner.send(sampleSnapshot({ second: 1, read: { started: 1 } }));

    change(withTableNamed("Orders"));
    expect(statusRegions()[1].textContent).toBe("Out of date");
    runner.send(throttledSecond(2));
    await runner.finish();

    expect(status()).toBe("Finished Steady. Failing so far.");
    expect(within(runTab()).queryAllByText(/Table/).length).toBeGreaterThan(0);
    expect(within(runTab()).queryByText(/Orders/)).toBeNull();
  });

  // Fails if the out-of-date region mounts with its text (screen readers
  // skip a region that appears with its text in it), its text isn't "Out
  // of date", or the change moves the focus.
  it("announces it from a region that was there, empty, before", async () => {
    const { runner, change } = renderProject();
    const [, region] = statusRegions();
    expect(region.textContent).toBe("");
    clickRun();
    await runner.finish();
    expect(region.textContent).toBe("");
    const run = screen.getByRole("button", { name: "Run" });
    run.focus();

    change(withTableNamed("Orders"));

    expect(statusRegions()[1]).toBe(region);
    expect(region.textContent).toBe("Out of date");
    expect(document.activeElement).toBe(run);
  });

  // Fails if freshness is a count of changes, not a comparison: changing
  // the project back would leave the run out of date.
  it("is current again once the project changes back", async () => {
    const { runner, change } = renderProject();
    clickRun();
    await runner.finish();
    change(withTableNamed("Orders"));

    change(withTableNamed("Table"));

    expect(statusRegions()[1].textContent).toBe("");
    expect(within(runTab()).queryByText(EARLIER_VERSION)).toBeNull();
  });
});

describe("OpenedProject in a wide window", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the right column isn't Details and Run tabs with Run first,
  // or Details stops saying nothing is selected.
  it("puts Details and Run in tabs, with Run selected", () => {
    renderProject();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Details", "Run"]);
    expect(
      screen.getByRole("tab", { name: "Run" }).getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Run" }), {
      key: "ArrowLeft",
    });
    expect(
      within(screen.getByRole("tabpanel", { name: "Details" })).getByText(
        /^Nothing selected./,
      ),
    ).toBeTruthy();
  });

  // Fails if the Run tab has no h3 of its own: a screen reader's outline
  // would put the run's findings and totals under Architecture.
  it("heads the Run tab, so the run's headings sit under it", () => {
    const { runner } = renderProject();
    clickRun();
    runner.send(sampleSnapshot({ second: 1, read: { started: 5 } }));

    const runTab = screen.getByRole("tabpanel", { name: "Run" });
    const [first, ...rest] = within(runTab).getAllByRole("heading");

    expect(first?.tagName).toBe("H3");
    expect(first?.textContent).toBe("Run");
    expect(rest.map((heading) => heading.tagName)).toContain("H4");
  });

  // Fails if showing Details stops the run, or selecting Run again starts
  // it afresh and loses the results it had.
  it("keeps a run going while Details shows, with its results there on return", async () => {
    const { runner } = renderProject();
    clickRun();
    runner.send(sampleSnapshot({ second: 1, read: { started: 5 } }));

    fireEvent.click(screen.getByRole("tab", { name: "Details" }));
    expect(screen.queryByRole("table")).toBeNull();
    runner.send(sampleSnapshot({ second: 2, read: { started: 3 } }));
    expect(runner.stopped).toBe(false);
    await runner.finish();
    fireEvent.click(screen.getByRole("tab", { name: "Run" }));

    expect(runner.runs).toBe(1);
    expect(status()).toBe("Finished Steady. Healthy so far.");
    expect(requestsSoFar()).toEqual(["All workflows", "8", "0", "0", "8"]);
  });
});

describe("OpenedProject's selection in a wide window", () => {
  preloadBeforeAll(() => import("../diagram/DiagramCanvas"));
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if selecting leaves the Run tab showing, or the focus where it
  // was, or Escape leaves Details showing or drops the focus on the page.
  it("opens Details on a selection, and Escape goes back to Run and the button", () => {
    renderProject();

    const button = selectFromText("Function (lambda)");

    expect(selectedTab()).toBe("Details");
    expect(document.activeElement).toBe(detailsHeading());
    expect(detailsHeading().textContent).toBe("Function · Lambda");
    fireEvent.keyDown(detailsHeading(), { key: "Escape" });
    expect(selectedTab()).toBe("Run");
    expect(document.activeElement).toBe(button);
    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  });

  // Fails if Details takes the focus when it mounts again without a new
  // selection, as it does when the window crosses the breakpoint (such as
  // on zooming in): the focus would jump away from where the user is.
  it("leaves the focus where it is when the window crosses the breakpoint", () => {
    const { resize } = renderProject();
    const button = selectFromText("Function (lambda)");
    button.focus();

    act(() => {
      resize("narrow");
    });

    expect(detailsHeading().textContent).toBe("Function · Lambda");
    expect(document.activeElement).toBe(button);
  });

  // Fails if a click on a box doesn't select its component, or a click on
  // the empty canvas leaves the selection in place.
  it("selects a node when it's clicked, and clears on a click on empty canvas", async () => {
    renderProject();

    fireEvent.click(await drawnNode("table"));
    expect(detailsHeading().textContent).toBe("Table · DynamoDB");
    expect((await drawnNode("table")).classList.contains("selected")).toBe(
      true,
    );
    const pane = document.querySelector(".react-flow__pane");
    fireEvent.click(pane as Element);

    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
    expect(selectedTab()).toBe("Run");
    expect((await drawnNode("table")).classList.contains("selected")).toBe(
      false,
    );
  });
});

describe("OpenedProject in a narrow window", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the tab roles show in a narrow window, where there are no
  // tabs for a screen reader to move between, or the run's results stop
  // following the model in a Run panel the keyboard can scroll.
  it("has no tabs, and shows the run in a panel of its own", () => {
    const { runner } = renderProject({ width: "narrow" });
    clickRun();
    runner.send(sampleSnapshot({ second: 1, read: { started: 5 } }));

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByText(/^Nothing selected./)).toBeNull();
    const panel = screen.getByRole("region", { name: "Run" });
    expect(panel.tabIndex).toBe(0);
    const architecture = screen.getByRole("region", { name: "Architecture" });
    expect(
      architecture.compareDocumentPosition(panel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(requestsSoFar()).toEqual(["All workflows", "5", "0", "0", "5"]);
  });

  // Fails if Details shows before anything is selected, stops following
  // the model, loses its Close button, or Close leaves it showing or drops
  // the focus.
  it("shows Details under the model while something is selected, until Close", () => {
    renderProject({ width: "narrow" });
    expect(screen.queryByRole("region", { name: "Details" })).toBeNull();

    const button = selectFromText("API → Function");
    const details = screen.getByRole("region", { name: "Details" });

    expect(document.activeElement).toBe(detailsHeading());
    expect(detailsHeading().textContent).toBe("API → Function · Connection");
    const architecture = screen.getByRole("region", { name: "Architecture" });
    expect(
      architecture.compareDocumentPosition(details) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(within(details).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Details" })).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
