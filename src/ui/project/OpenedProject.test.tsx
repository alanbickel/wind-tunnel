// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import { RunSimulation } from "../../application/use-cases/run-simulation";
import type { Project } from "../../domain/model/project";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
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
  stubWindowWidth(width);
  const runner = new ManualSimulationRunner();
  const useCases = fakeUseCases({
    runSimulation: new RunSimulation({ runner }),
  });
  const view = render(
    <UseCasesProvider useCases={useCases}>
      <OpenedProject record={{ ...sampleRecord, project }} />
    </UseCasesProvider>,
  );
  return { runner, ...view };
}

function status(): string | null {
  return screen.getByRole("status").textContent;
}

/**
 * Every text the status region commits while `action` runs, in order: what
 * a screen reader could announce, including texts replaced in the same act.
 */
function statusesDuring(action: () => void): (string | null)[] {
  const region = screen.getByRole("status");
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
    expect(
      screen.getByRole("heading", { level: 2, name: "Sample project" }),
    ).toBeTruthy();
    expect(screen.getByText("A small project for tests.")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Workload" })).toBeTruthy();
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
      screen.getByText("This project has no workloads to run."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
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
    expect(screen.getByRole("tabpanel", { name: "Details" }).textContent).toBe(
      "Nothing selected.",
    );
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
    expect(screen.queryByText("Nothing selected.")).toBeNull();
    const panel = screen.getByRole("region", { name: "Run" });
    expect(panel.tabIndex).toBe(0);
    expect(requestsSoFar()).toEqual(["All workflows", "5", "0", "0", "5"]);
  });
});
