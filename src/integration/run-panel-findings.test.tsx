// @vitest-environment jsdom
// The run's verdict and findings on a project screen, for real template
// runs. It sits outside the layers, as the composition root does, because
// it needs the templates and the in-process runner (adapters) and the
// screen (ui), which may not import each other.
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { InProcessSimulationRunner } from "../adapters/simulation/in-process-simulation-runner";
import { formatFindings, formatVerdict } from "../adapters/cli/findings-report";
import { RUN_TIMEOUT_MS } from "../adapters/templates/testing/run-template";
import {
  projectA,
  projectB,
} from "../adapters/templates/testing/scenario-runs";
import type {
  SimulationOutcome,
  SimulationRunInput,
  SimulationRunner,
} from "../application/ports/simulation-runner";
import { createDetectors } from "../application/run-analysis/findings/create-detectors";
import { componentNames } from "../application/run-analysis/component-names";
import { createPhrasebook } from "../application/run-analysis/findings/create-phrasebook";
import { findRun } from "../application/run-analysis/findings/find-run";
import { RunSimulation } from "../application/use-cases/run-simulation";
import { createAwsComponentRegistry } from "../domain/components/aws";
import type { MetricsSnapshot } from "../domain/metrics/metrics-snapshot";
import type { Project } from "../domain/model/project";
import { fakeUseCases } from "../ui/app/testing/fake-use-cases";
import { UseCasesProvider } from "../ui/app/UseCasesProvider";
import { sampleRecord } from "../application/testing/sample-record";
import { stubDiagramBrowserApis } from "../ui/diagram/testing/stub-diagram-browser-apis";
import { OpenedProject } from "../ui/project/OpenedProject";
import { stubWindowWidth } from "../ui/shared/testing/stub-window-width";

const registry = createAwsComponentRegistry();

/**
 * The in-process runner, stopped after `stopAfter` snapshots if given, as
 * a click on Stop would: the runner honors a signal fired from
 * `onSnapshot`. Keeps the snapshots it delivered, for the CLI to read.
 */
class RecordingRunner implements SimulationRunner {
  private readonly runner = new InProcessSimulationRunner({ registry });
  readonly snapshots: MetricsSnapshot[] = [];
  private readonly stopAfter: number | undefined;

  constructor(stopAfter?: number) {
    this.stopAfter = stopAfter;
  }

  run(input: SimulationRunInput): Promise<SimulationOutcome> {
    // Fires on the panel's Stop, or after `stopAfter` snapshots.
    const stop = new AbortController();
    input.stopSignal?.addEventListener("abort", () => {
      stop.abort();
    });
    return this.runner.run({
      ...input,
      stopSignal: stop.signal,
      onSnapshot: (snapshot) => {
        this.snapshots.push(snapshot);
        input.onSnapshot?.(snapshot);
        if (this.snapshots.length === this.stopAfter) stop.abort();
      },
    });
  }
}

/** A template's workload, by the start of its name, run in the panel. */
interface PanelRunInput {
  readonly project: Project;
  readonly workloadName: string;
  readonly stopAfter?: number;
}

/** What the panel was given to run, and what the CLI makes of it. */
interface PanelRun {
  readonly cliVerdict: string;
  readonly cliSummaries: string[];
}

/**
 * Renders the project in a wide window, picks the workload in the project
 * bar, runs it to the end (or the stop), and words the same snapshots as
 * the CLI does.
 */
async function runInPanel(input: PanelRunInput): Promise<PanelRun> {
  const { project, workloadName, stopAfter } = input;
  const runner = new RecordingRunner(stopAfter);
  const useCases = fakeUseCases({
    runSimulation: new RunSimulation({ runner, registry }),
  });
  stubDiagramBrowserApis();
  stubWindowWidth("wide");
  render(
    <UseCasesProvider useCases={useCases}>
      <OpenedProject
        record={{ ...sampleRecord, project, layout: { nodes: {} } }}
      />
    </UseCasesProvider>,
  );
  const workload = project.workloads.find((w) =>
    w.name.startsWith(workloadName),
  );
  if (workload === undefined) throw new Error(`No ${workloadName} workload`);
  fireEvent.change(screen.getByLabelText("Workload"), {
    target: { value: workload.id },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await Promise.resolve();
  });
  return cliReading({
    project,
    workloadId: workload.id,
    snapshots: runner.snapshots,
  });
}

/** The CLI's verdict, and each finding's numbered first line. */
function cliReading(run: Parameters<typeof findRun>[0]): PanelRun {
  const detectors = createDetectors();
  const findings = findRun(run, detectors);
  const wording = {
    phrasebook: createPhrasebook({ project: run.project, detectors }),
    nameOf: componentNames(run.project, createAwsComponentRegistry()),
  };
  const summaries = formatFindings(findings, wording)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[\d.]+\. (Failure|Warning|Note): /.test(line));
  return {
    cliVerdict: formatVerdict(findings.verdict, wording),
    cliSummaries: summaries,
  };
}

/** The run's status line: the first status region; whether it's out of date is the second. */
function runStatus(): string | null | undefined {
  return screen.getAllByRole("status")[0]?.textContent;
}

/** The section the verdict's title names. */
function verdictRegion(): HTMLElement {
  return screen.getByRole("region", { name: /^(Healthy|Degraded|Failing)/ });
}

/** The verdict as the CLI prints it: "<title>. <summary>", then its lines. */
function panelVerdict(): string {
  const region = verdictRegion();
  const title = region.querySelector("h4")?.textContent ?? "";
  const lines = [
    ...(region.querySelector("div")?.querySelectorAll("p") ?? []),
  ].map((p) => p.textContent);
  const [summary, ...rest] = lines;
  return [`${title}. ${String(summary)}`, ...rest].join("\n");
}

/** Each finding's summary line, in order, causes after what they explain. */
function panelSummaries(): string[] {
  return within(verdictRegion())
    .queryAllByRole("button", { name: /^About finding/ })
    .map(
      (button) => button.closest("li")?.querySelector("p")?.textContent ?? "",
    );
}

/** The list item of the finding numbered `number`, e.g. "1.1". */
function findingItem(number: string): HTMLElement {
  const button = screen.getByRole("button", {
    name: `About finding ${number}`,
  });
  const item = button.closest("li");
  if (item === null) throw new Error(`finding ${number} isn't in a list`);
  return item;
}

describe("the run panel's findings, Template A, lunch rush", () => {
  let cli: PanelRun;
  beforeAll(async () => {
    cli = await runInPanel({ project: projectA, workloadName: "Lunch rush" });
  }, RUN_TIMEOUT_MS);
  afterAll(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the panel words the verdict or a finding other than the CLI
  // does, or lists the findings in another order.
  it("says what the CLI says", () => {
    expect(panelVerdict()).toBe(cli.cliVerdict);
    expect(panelSummaries()).toEqual(cli.cliSummaries);
  });

  // Fails if the run isn't read as failing, the connections failure isn't
  // first, or the queryWorkers note isn't nested beneath it.
  it("is failing, with the connections failure first and its cause beneath it", () => {
    expect(verdictRegion().querySelector("h4")?.textContent).toBe("Failing");
    const first = findingItem("1");
    expect(first.querySelector("p")?.textContent).toMatch(
      /^1\. Failure: 28,841 requests failed with orders-db: too-many-connections/,
    );
    const cause = findingItem("1.1");
    expect(first.contains(cause)).toBe(true);
    expect(cause.querySelector("p")?.textContent).toMatch(
      /^1\.1\. Note: .*orders-db's queryWorkers/,
    );
  });

  // Fails if the status line stops announcing the verdict's title.
  it("announces the verdict in the status line", () => {
    expect(runStatus()).toBe(
      "Finished Lunch rush, 20 s at 2,000 requests/s. Failing.",
    );
  });
});

describe("the run panel's findings, Template B, long rush", () => {
  let cli: PanelRun;
  beforeAll(async () => {
    cli = await runInPanel({ project: projectB, workloadName: "Long rush" });
  }, RUN_TIMEOUT_MS);
  afterAll(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the panel words the verdict or a finding other than the CLI.
  it("says what the CLI says", () => {
    expect(panelVerdict()).toBe(cli.cliVerdict);
    expect(panelSummaries()).toEqual(cli.cliSummaries);
  });

  // Fails if a degraded verdict stops naming its top warning in the short
  // form, the late-async-work finding's.
  it("is degraded, and the verdict names the late-async-work warning", () => {
    expect(verdictRegion().querySelector("h4")?.textContent).toBe("Degraded");
    expect(panelVerdict()).toContain(
      "All 273,539 answered requests succeeded, but work queued in orders-queue finished past the 29 s API Gateway waits for fn-api;",
    );
    expect(findingItem("1").querySelector("p")?.textContent).toMatch(
      /^1\. Warning: Work queued in orders-queue finished/,
    );
  });
});

describe("the run panel's findings, Template A, steady day", () => {
  let cli: PanelRun;
  beforeAll(async () => {
    cli = await runInPanel({ project: projectA, workloadName: "Steady day" });
  }, RUN_TIMEOUT_MS);
  afterAll(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if a healthy run loses its closest-to-failing line, or shows a
  // finding where the CLI has none.
  it("is healthy, with a closest-to-failing line and no findings", () => {
    expect(panelVerdict()).toBe(cli.cliVerdict);
    expect(verdictRegion().querySelector("h4")?.textContent).toBe("Healthy");
    expect(panelVerdict()).toMatch(
      /\nClosest to failing: orders-db connections/,
    );
    expect(panelSummaries()).toEqual([]);
    expect(within(verdictRegion()).getByText("None.")).toBeTruthy();
  });
});

describe("the run panel's findings, a run stopped early", () => {
  beforeAll(async () => {
    await runInPanel({
      project: projectA,
      workloadName: "Lunch rush",
      stopAfter: 30,
    });
  }, RUN_TIMEOUT_MS);
  afterAll(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if a run that didn't reach its workload's end reads as finished.
  it("reads 'so far'", () => {
    expect(verdictRegion().querySelector("h4")?.textContent).toBe(
      "Failing so far",
    );
    expect(runStatus()).toMatch(
      /^Stopped Lunch rush.* after 30 of 60 simulated seconds\. Failing so far\.$/,
    );
  });
});
