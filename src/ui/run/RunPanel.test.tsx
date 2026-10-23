// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type {
  SimulationOutcome,
  SimulationRunInput,
  SimulationRunner,
} from "../../application/ports/simulation-runner";
import { sampleRecord } from "../../application/testing/sample-record";
import { RunSimulation } from "../../application/use-cases/run-simulation";
import type { MetricsSnapshot } from "../../domain/metrics/metrics-snapshot";
import type { Project } from "../../domain/model/project";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { RunPanel } from "./RunPanel";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";

/**
 * A runner the test drives: each run waits until the test sends snapshots
 * and ends it, or the stop signal fires.
 */
class ManualSimulationRunner implements SimulationRunner {
  private input: SimulationRunInput | undefined;
  private settle: ((outcome: SimulationOutcome) => void) | undefined;
  private fail: ((error: Error) => void) | undefined;
  runs = 0;

  run(input: SimulationRunInput): Promise<SimulationOutcome> {
    this.runs += 1;
    this.input = input;
    return new Promise((resolve, reject) => {
      this.settle = resolve;
      this.fail = reject;
      input.stopSignal?.addEventListener("abort", () => {
        resolve({ status: "stopped" });
      });
    });
  }

  get stopped(): boolean {
    return this.input?.stopSignal?.aborted ?? false;
  }

  send(snapshot: MetricsSnapshot): void {
    act(() => {
      this.input?.onSnapshot?.(snapshot);
    });
  }

  async finish(): Promise<void> {
    await act(async () => {
      this.settle?.({
        status: "finished",
        run: {
          eventsProcessed: 0,
          snapshots: [],
          totals: sampleSnapshot({ second: 1 }),
        },
      });
      await Promise.resolve();
    });
  }

  async crash(message: string): Promise<void> {
    await act(async () => {
      this.fail?.(new Error(message));
      await Promise.resolve();
    });
  }
}

const twoWorkloads: Project = {
  ...sampleRecord.project,
  workloads: sampleRecord.project.workloads.flatMap((steady) => [
    steady,
    { ...steady, id: "spike", name: "Spike" },
  ]),
};

function renderPanel(project: Project = sampleRecord.project) {
  const runner = new ManualSimulationRunner();
  const useCases = fakeUseCases({
    runSimulation: new RunSimulation({ runner }),
  });
  const view = render(
    <UseCasesProvider useCases={useCases}>
      <RunPanel project={project} />
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

describe("RunPanel", () => {
  afterEach(cleanup);

  it("has its status region in place, empty, before the first run", () => {
    renderPanel();

    // Screen readers announce changes only to a region they already know.
    expect(status()).toBe("");
    expect(screen.queryByRole("table")).toBeNull();
  });

  // Fails if RunPanel stops passing `scrolls` to its Panel: in a wide
  // window the panel scrolls on its own, and the keyboard couldn't scroll it.
  it("is a region the keyboard can focus, to scroll it", () => {
    renderPanel();

    expect(screen.getByRole("region", { name: "Run" }).tabIndex).toBe(0);
  });

  it("fills in totals and charts as snapshots arrive, then finishes", async () => {
    const { runner } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
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
    expect(screen.getAllByRole("figure")).toHaveLength(4);
    await runner.finish();
    expect(status()).toBe("Finished Steady. Failing so far.");
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  });

  it("measures progress in simulated time, so a run that ends partway through a second fills the bar", async () => {
    const [steady] = sampleRecord.project.workloads;
    if (steady === undefined) throw new Error("sample has no workload");
    const { runner } = renderPanel({
      ...sampleRecord.project,
      workloads: [{ ...steady, durationMs: 2_500 }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    // The sampler ticks each second, then once more at the duration.
    runner.send(sampleSnapshot({ second: 1 }));
    runner.send({ ...sampleSnapshot({ second: 3 }), endMs: 2_500 });
    await runner.finish();

    const progress = screen.getByRole<HTMLProgressElement>("progressbar");
    expect(screen.getByText("2.5 of 2.5 simulated seconds")).toBeTruthy();
    expect(progress.value).toBe(progress.max);
  });

  it("stops partway and keeps what it got", async () => {
    const { runner } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
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
    const { runner } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await runner.crash("The simulation Worker failed to start.");

    expect(status()).toBe(
      "Steady failed: Error: The simulation Worker failed to start.",
    );
  });

  it("runs the workload picked, and locks the picker while it runs", () => {
    const { runner } = renderPanel(twoWorkloads);
    const picker = screen.getByRole("combobox", { name: "Workload" });

    fireEvent.change(picker, { target: { value: "spike" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(status()).toBe("Running Spike… Healthy so far.");
    expect((picker as HTMLSelectElement).disabled).toBe(true);
    expect(runner.runs).toBe(1);
  });

  it("offers Stop only while running, without moving the focus", async () => {
    const { runner } = renderPanel();
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

  it("ignores a click on Stop that lands after the run ended", async () => {
    // In the browser a busy page delayed Stop clicks until the run had
    // ended; with one Run/Stop button, each late click started a new run.
    const { runner } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await runner.finish();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(runner.runs).toBe(1);
    expect(status()).toBe("Finished Steady. Healthy so far.");
  });

  // Fails if the status line pairs a new run with the previous run's
  // verdict while the deferred snapshots catch up: it reads "Running
  // Steady… Failing so far." for a commit, and a screen reader can say so.
  it("never announces the previous run's verdict as a new run starts", async () => {
    const { runner } = renderPanel();
    const run = screen.getByRole("button", { name: "Run" });
    fireEvent.click(run);
    runner.send(
      sampleSnapshot({
        second: 1,
        read: { started: 1, failed: 1, failures: { "table: throttled": 1 } },
        table: { arrivals: 1, rejected: 1 },
      }),
    );
    await runner.finish();
    expect(status()).toBe("Finished Steady. Failing so far.");

    const statuses = statusesDuring(() => {
      fireEvent.click(run);
    });

    // No title until the deferred render reaches the new run.
    expect(statuses).toEqual([
      "Running Steady…",
      "Running Steady… Healthy so far.",
    ]);
  });

  it("ignores a second Run that lands before React re-renders", () => {
    // Both clicks in one act(), so the second still sees Run as usable;
    // only the hook's own guard can stop it.
    const { runner } = renderPanel();
    const run = screen.getByRole("button", { name: "Run" });

    act(() => {
      fireEvent.click(run);
      fireEvent.click(run);
    });

    expect(runner.runs).toBe(1);
  });

  it("stops the run when the user leaves the screen", () => {
    const { runner, unmount } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    unmount();

    expect(runner.stopped).toBe(true);
  });

  it("says so when the project has no workloads", () => {
    renderPanel({ ...sampleRecord.project, workloads: [] });

    expect(
      screen.getByText("This project has no workloads to run."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });
});
