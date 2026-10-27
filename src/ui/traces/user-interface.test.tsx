// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  SimulationOutcome,
  SimulationRunInput,
  SimulationRunner,
} from "../../application/ports/simulation-runner";
import type { ProjectRecord } from "../../application/ports/project-record";
import type { StoragePersistence } from "../../application/ports/storage-persistence";
import { sampleRecord } from "../../application/testing/sample-record";
import { awsRunSimulation } from "../../application/testing/aws-run-simulation";
import type { LatencySummary } from "../../domain/metrics/latency-histogram";
import type {
  MetricsSnapshot,
  WorkflowMetrics,
} from "../../domain/metrics/metrics-snapshot";
import { App } from "../App";
import { inMemoryUseCases } from "../app/testing/in-memory-use-cases";
import type { UseCases } from "../app/use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { stubWindowWidth } from "../shared/testing/stub-window-width";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";

// Worked example for docs/architecture/user-interface.md. It renders the
// whole app as main.tsx does, inside a UseCasesProvider, and follows a user
// from creating a project to a finished run. It records each click, each
// use case call the components make, and what the screen shows after. The
// runner stands in for WebWorkerSimulationRunner: `ui/` can't import
// adapters, and the test sends the snapshots a Worker would post. The
// timeline is a snapshot: if the flow changes, this test fails and the diff
// shows how. Run `npx vitest run src/ui/traces --update` to accept an intended
// change, then check the guide still matches.

/** The lines of the timeline, grouped under the user action that led to them. */
class Trace {
  private readonly lines: string[] = [];

  action(text: string): void {
    this.lines.push("", text);
  }

  call(text: string): void {
    this.lines.push(`  call     ${text}`);
  }

  screen(text: string): void {
    this.lines.push(`  screen   ${text}`);
  }

  toString(): string {
    return `${this.lines.join("\n").trimStart()}\n`;
  }
}

/** A Worker runner the test drives: it sends snapshots, then ends the run. */
class StandInWorkerRunner implements SimulationRunner {
  private readonly trace: Trace;
  private input: SimulationRunInput | undefined;
  private settle: ((outcome: SimulationOutcome) => void) | undefined;

  constructor(trace: Trace) {
    this.trace = trace;
  }

  run(input: SimulationRunInput): Promise<SimulationOutcome> {
    const { project, workloadId } = input.request;
    this.trace.call(
      `runner.run({ request: { project: ${project.id}, workloadId: "${workloadId}" }, onSnapshot, stopSignal })`,
    );
    this.input = input;
    return new Promise((resolve) => {
      this.settle = resolve;
    });
  }

  send(snapshot: MetricsSnapshot): void {
    this.trace.action(
      `Worker posts the snapshot for ${String(snapshot.startMs)}–${String(snapshot.endMs)} ms`,
    );
    act(() => {
      this.input?.onSnapshot?.(snapshot);
    });
  }

  async finish(snapshots: readonly MetricsSnapshot[]): Promise<void> {
    this.trace.action("Worker posts finished");
    const totals = runTotals(snapshots);
    await act(async () => {
      this.settle?.({
        status: "finished",
        run: { eventsProcessed: 0, snapshots: [...snapshots], totals },
      });
      await Promise.resolve();
    });
  }
}

/** The sample as a template, its workload cut to the two seconds the test sends. */
const TWO_SECOND_TEMPLATE: ProjectRecord = {
  ...sampleRecord,
  project: {
    ...sampleRecord.project,
    workloads: sampleRecord.project.workloads.map((workload) => ({
      ...workload,
      durationMs: 2_000,
    })),
  },
};

/** End-to-end latency of a second's successful requests. */
function latency(p99Ms: number): LatencySummary {
  return { count: 1, p50Ms: p99Ms, p95Ms: p99Ms, p99Ms, maxMs: p99Ms };
}

/** The run's totals: its snapshots' requests added up, over the whole run. */
function runTotals(snapshots: readonly MetricsSnapshot[]): MetricsSnapshot {
  const sum = (count: (read: WorkflowMetrics) => number) =>
    snapshots.reduce(
      (total, snapshot) =>
        total + (snapshot.workflows.read ? count(snapshot.workflows.read) : 0),
      0,
    );
  const read = {
    started: sum((w) => w.started),
    succeeded: sum((w) => w.succeeded),
    failed: sum((w) => w.failed),
  };
  const endMs = snapshots.at(-1)?.endMs ?? 0;
  return { ...sampleSnapshot({ second: 1, read }), startMs: 0, endMs };
}

/** Wraps each use case the components call so it records the call and result. */
function tracedUseCases(trace: Trace, runner: SimulationRunner): UseCases {
  const { useCases } = inMemoryUseCases([TWO_SECOND_TEMPLATE]);
  const runSimulation = awsRunSimulation(runner);
  const storagePersistence: StoragePersistence = {
    request: () => {
      trace.call("storagePersistence.request() → persisted");
      return Promise.resolve("persisted");
    },
  };
  return {
    ...useCases,
    storagePersistence,
    listProjects: {
      execute: async () => {
        const summaries = await useCases.listProjects.execute();
        const names = summaries.map((s) => `${s.id} "${s.name}"`);
        trace.call(`listProjects.execute() → [${names.join(", ")}]`);
        return summaries;
      },
    },
    listTemplates: {
      execute: async () => {
        const templates = await useCases.listTemplates.execute();
        const ids = templates.map((t) => t.id);
        trace.call(`listTemplates.execute() → [${ids.join(", ")}]`);
        return templates;
      },
    },
    createProjectFromTemplate: {
      execute: async (templateId) => {
        const result =
          await useCases.createProjectFromTemplate.execute(templateId);
        const id = result.status === "created" ? result.record.project.id : "";
        trace.call(
          `createProjectFromTemplate.execute("${templateId}") → ${result.status} ${id}`,
        );
        return result;
      },
    },
    openProject: {
      execute: async (id) => {
        const lookup = await useCases.openProject.execute(id);
        trace.call(`openProject.execute("${id}") → ${lookup.status}`);
        return lookup;
      },
    },
    runSimulation: {
      execute: async (input) => {
        trace.call(
          `runSimulation.execute({ project: ${input.project.id}, workloadId: "${String(input.workloadId)}", onSnapshot, stopSignal })`,
        );
        const result = await runSimulation.execute(input);
        trace.call(`runSimulation.execute → ${result.status}`);
        return result;
      },
    },
  };
}

function status(): string {
  // The project bar's first status region is the run's; the storage hint
  // and the bar's other regions are status regions too.
  const bar = screen.getByRole("region", { name: "Sample project" });
  return within(bar).getAllByRole("status")[0]?.textContent ?? "";
}

/** The footer of "Requests (run totals)": the totals across workflows. */
function requestTotals(): string {
  const table = screen.getByRole("table", { name: "Requests (run totals)" });
  const cells = [...(table.querySelector("tfoot tr")?.children ?? [])];
  const [started, succeeded, failed, inProgress] = cells
    .slice(1)
    .map((cell) => cell.textContent);
  return `requests (run totals): started ${String(started)} = succeeded ${String(succeeded)} + failed ${String(failed)} + in progress ${String(inProgress)}`;
}

/** The verdict's title and summary, and how many findings are listed. */
function verdictLine(): string {
  const region = screen.getByRole("region", {
    name: /^(Healthy|Degraded|Failing)/,
  });
  const title = region.querySelector("h4")?.textContent ?? "";
  const summary = region.querySelector("p")?.textContent ?? "";
  const findings = within(region).queryAllByRole("button", {
    name: /^About finding/,
  }).length;
  return `verdict "${title}": "${summary}" ${String(findings)} findings`;
}

/** The top bar's breadcrumb, crumb by crumb, without the drawn separators. */
function breadcrumb(): string {
  const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
  const crumbs = within(nav)
    .getAllByRole("listitem")
    .map((item) => item.textContent.replace("›", ""));
  return `breadcrumb "${crumbs.join(" › ")}"`;
}

/** Each chart's title and how many seconds its table holds. */
function traceCharts(trace: Trace): void {
  for (const figure of screen.getAllByRole("figure")) {
    const title = figure.querySelector("h4")?.textContent ?? "";
    const rows = within(figure).getAllByRole("row").length - 1;
    trace.screen(`chart "${title}": ${String(rows)} s of points`);
  }
}

function traceRunScreen(trace: Trace): void {
  const progress = screen.getByRole<HTMLProgressElement>("progressbar");
  trace.screen(`status "${status()}"`);
  trace.screen(
    `progress ${String(progress.value)} of ${String(progress.max)} simulated seconds`,
  );
  trace.screen(verdictLine());
  trace.screen(requestTotals());
  traceCharts(trace);
}

async function createAndOpen(trace: Trace): Promise<void> {
  await screen.findByRole("button", {
    name: "Create a project from Sample project",
  });
  trace.screen("projects screen: your projects, and the templates");
  trace.screen(breadcrumb());

  trace.action('User clicks "Create a project from Sample project"');
  fireEvent.click(
    screen.getByRole("button", {
      name: "Create a project from Sample project",
    }),
  );
  await screen.findByRole("button", { name: "Sample project" });
  trace.screen('the list now has "Sample project"');

  trace.action('User clicks "Sample project"');
  fireEvent.click(screen.getByRole("button", { name: "Sample project" }));
  await screen.findByRole("heading", { name: "Sample project" });
  const components = screen.getByRole("list", { name: "Components" });
  trace.screen(
    `project screen: heading, architecture (${String(within(components).getAllByRole("listitem").length)} components), run controls`,
  );
  trace.screen(breadcrumb());
}

async function runAndChart(
  trace: Trace,
  runner: StandInWorkerRunner,
): Promise<void> {
  trace.action('User clicks "Run"');
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  trace.screen(`status "${status()}"`);

  const snapshots = [
    sampleSnapshot({
      second: 1,
      read: { started: 20, succeeded: 18, latency: latency(12) },
    }),
    sampleSnapshot({
      second: 2,
      read: { started: 20, succeeded: 21, latency: latency(15) },
    }),
  ];
  for (const snapshot of snapshots) {
    runner.send(snapshot);
    traceRunScreen(trace);
  }
  await runner.finish(snapshots);
  trace.screen(`status "${status()}"`);
}

beforeEach(() => {
  stubDiagramBrowserApis();
  stubWindowWidth("wide");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Long enough for the whole app to render while the rest of the suite runs. */
const TRACE_TIMEOUT_MS = 30_000;

// Fails if useSimulationRun's onSnapshot stops storing snapshots: progress,
// totals, and every chart stay at zero. Also fails if App stops naming the
// open project in the breadcrumb, or if the run panel stops showing the
// verdict, or its title, summary, or number of findings changes.
it(
  "traces a user from a template to a run's charts",
  async () => {
    const trace = new Trace();
    const runner = new StandInWorkerRunner(trace);
    trace.action("App renders inside UseCasesProvider, as main.tsx does");
    render(
      <UseCasesProvider useCases={tracedUseCases(trace, runner)}>
        <App />
      </UseCasesProvider>,
    );

    await createAndOpen(trace);
    await runAndChart(trace, runner);

    await expect(trace.toString()).toMatchFileSnapshot("user-interface.txt");
  },
  TRACE_TIMEOUT_MS,
);
