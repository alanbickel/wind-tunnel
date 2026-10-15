import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import type {
  MetricsRun,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import type { Project } from "../../domain/model/project";
import type { Clock } from "../../application/ports/clock";
import type { IdGenerator } from "../../application/ports/id-generator";
import type {
  ProjectRecord,
  ProjectSummary,
} from "../../application/ports/project-record";
import type {
  ProjectLookup,
  ProjectRepository,
} from "../../application/ports/project-repository";
import type {
  SimulationRequest,
  SimulationRunner,
} from "../../application/ports/simulation-runner";
import type {
  TemplateCatalog,
  TemplateSummary,
} from "../../application/ports/template-catalog";
import {
  FixedClock,
  SequentialIds,
} from "../../application/testing/fake-ports";
import { CreateProjectFromTemplate } from "../../application/use-cases/create-project-from-template";
import { DeleteProject } from "../../application/use-cases/delete-project";
import { ListProjects } from "../../application/use-cases/list-projects";
import { OpenProject } from "../../application/use-cases/open-project";
import { RunSimulation } from "../../application/use-cases/run-simulation";
import { SaveProject } from "../../application/use-cases/save-project";
import { IndexedDbProjectRepository } from "../persistence/indexeddb-project-repository";
import {
  openProjectDatabase,
  type ProjectDatabase,
} from "../persistence/project-database";
import { projectDocumentV1Schema } from "../persistence/project-document-v1";
import { InProcessSimulationRunner } from "../simulation/in-process-simulation-runner";
import { createBundledTemplateCatalog } from "../templates/bundled-template-catalog";

// Worked example for docs/architecture/application-layer.md. It follows one
// project through the use cases, wired to the real adapters, and records
// every call a use case makes on a port, plus what IndexedDB holds. The
// timeline is a snapshot: if the flow changes, this test fails and the diff
// shows how. Run `npx vitest run -u src/adapters/traces` to accept an
// intended change, then check the guide still matches.

const CREATED_AT = "2026-10-15T12:00:00.000Z";
const RENAMED_AT = "2026-10-15T12:05:00.000Z";
const RUN_DURATION_MS = 3_000;

/** The lines of the timeline, grouped under the use case that made them. */
class Trace {
  private readonly lines: string[] = [];

  useCase(call: string): void {
    this.lines.push("", call);
  }

  port(call: string): void {
    this.lines.push(`  port     ${call}`);
  }

  result(text: string): void {
    this.lines.push(`  result   ${text}`);
  }

  note(text: string): void {
    this.lines.push(`  ${text}`);
  }

  toString(): string {
    return `${this.lines.join("\n").trimStart()}\n`;
  }
}

function describeRecord({ project, updatedAt }: ProjectRecord): string {
  return `record ${project.id} "${project.name}" (updatedAt ${updatedAt})`;
}

function describeSummaries(summaries: readonly ProjectSummary[]): string {
  const entries = summaries.map((s) => `${s.id} "${s.name}"`);
  return `[${entries.join(", ")}]`;
}

// Port wrappers that pass each call to the real adapter and record it.

class TracedClock implements Clock {
  private readonly inner: FixedClock;
  private readonly trace: Trace;

  constructor(inner: FixedClock, trace: Trace) {
    this.inner = inner;
    this.trace = trace;
  }

  now(): string {
    const time = this.inner.now();
    this.trace.port(`clock.now() → ${time}`);
    return time;
  }
}

class TracedIds implements IdGenerator {
  private readonly inner: IdGenerator;
  private readonly trace: Trace;

  constructor(inner: IdGenerator, trace: Trace) {
    this.inner = inner;
    this.trace = trace;
  }

  newId(): string {
    const id = this.inner.newId();
    this.trace.port(`ids.newId() → ${id}`);
    return id;
  }
}

class TracedTemplates implements TemplateCatalog {
  private readonly inner: TemplateCatalog;
  private readonly trace: Trace;

  constructor(inner: TemplateCatalog, trace: Trace) {
    this.inner = inner;
    this.trace = trace;
  }

  async list(): Promise<TemplateSummary[]> {
    const summaries = await this.inner.list();
    this.trace.port(`templates.list() → ${String(summaries.length)} templates`);
    return summaries;
  }

  async get(id: string): Promise<ProjectRecord | undefined> {
    const record = await this.inner.get(id);
    const found = record === undefined ? "undefined" : describeRecord(record);
    this.trace.port(`templates.get("${id}") → ${found}`);
    return record;
  }
}

class TracedProjects implements ProjectRepository {
  private readonly inner: ProjectRepository;
  private readonly trace: Trace;

  constructor(inner: ProjectRepository, trace: Trace) {
    this.inner = inner;
    this.trace = trace;
  }

  async list(): Promise<ProjectSummary[]> {
    const summaries = await this.inner.list();
    this.trace.port(`projects.list() → ${describeSummaries(summaries)}`);
    return summaries;
  }

  async get(id: string): Promise<ProjectLookup> {
    const lookup = await this.inner.get(id);
    this.trace.port(`projects.get("${id}") → ${lookup.status}`);
    return lookup;
  }

  async save(record: ProjectRecord): Promise<void> {
    await this.inner.save(record);
    this.trace.port(`projects.save(${describeRecord(record)})`);
  }

  async delete(id: string): Promise<void> {
    await this.inner.delete(id);
    this.trace.port(`projects.delete("${id}")`);
  }
}

class TracedRunner implements SimulationRunner {
  private readonly inner: SimulationRunner;
  private readonly trace: Trace;

  constructor(inner: SimulationRunner, trace: Trace) {
    this.inner = inner;
    this.trace = trace;
  }

  async run(
    request: SimulationRequest,
    onSnapshot?: (snapshot: MetricsSnapshot) => void,
  ): Promise<MetricsRun> {
    const { project, workloadId } = request;
    this.trace.port(
      `runner.run({ project: ${project.id}, workloadId: "${workloadId}" })`,
    );
    const run = await this.inner.run(request, onSnapshot);
    this.trace.port(`runner.run → ${String(run.snapshots.length)} snapshots`);
    return run;
  }
}

const registry = createAwsComponentRegistry();
let database: ProjectDatabase;

beforeEach(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  database = await openProjectDatabase();
});

afterEach(() => {
  database.close();
  vi.unstubAllGlobals();
});

function wireUseCases(trace: Trace) {
  const clock = new FixedClock(CREATED_AT);
  const tracedClock = new TracedClock(clock, trace);
  const templates = new TracedTemplates(
    createBundledTemplateCatalog(registry),
    trace,
  );
  const projects = new TracedProjects(
    new IndexedDbProjectRepository({ database, registry }),
    trace,
  );
  const runner = new TracedRunner(
    new InProcessSimulationRunner({ registry }),
    trace,
  );
  return {
    clock,
    createProject: new CreateProjectFromTemplate({
      templates,
      projects,
      clock: tracedClock,
      ids: new TracedIds(new SequentialIds("project"), trace),
    }),
    saveProject: new SaveProject({ projects, clock: tracedClock, registry }),
    listProjects: new ListProjects({ projects }),
    openProject: new OpenProject({ projects }),
    runSimulation: new RunSimulation({ runner }),
    deleteProject: new DeleteProject({ projects }),
  };
}

/** What the `projects` store holds for a project: the document, not the record. */
async function traceStoredDocument(trace: Trace, record: ProjectRecord) {
  const stored = await database.get("projects", record.project.id);
  const document = projectDocumentV1Schema.parse(stored);
  const workload = document.workloads[0];
  const recordWorkload = record.project.workloads[0];
  trace.note(`IndexedDB "projects" store, key "${document.id}":`);
  trace.note(`  schemaVersion ${String(document.schemaVersion)}`);
  trace.note(
    `  createdAt ${document.createdAt}, updatedAt ${document.updatedAt}`,
  );
  trace.note(`  source ${JSON.stringify(document.source)}`);
  trace.note(
    `  workloads[0].durationSec ${String(workload?.durationSec)}   (the record has durationMs ${String(recordWorkload?.durationMs)})`,
  );
}

/** The project with its workloads cut short, so the trace stays small. */
function shortened(project: Project): Project {
  const workloads = project.workloads.map((w) => ({
    ...w,
    durationMs: RUN_DURATION_MS,
  }));
  return { ...project, workloads };
}

/** Run totals as a sum that must add up: started = succeeded + failed + unfinished. */
function describeTotals(run: MetricsRun): string {
  const all = Object.values(run.totals.workflows);
  const sum = (pick: (w: (typeof all)[number]) => number) =>
    all.reduce((total, w) => total + pick(w), 0);
  const started = sum((w) => w.started);
  const succeeded = sum((w) => w.succeeded);
  const failed = sum((w) => w.failed);
  const unfinished = started - succeeded - failed;
  return `started ${String(started)} = succeeded ${String(succeeded)} + failed ${String(failed)} + unfinished ${String(unfinished)}`;
}

type App = ReturnType<typeof wireUseCases>;

/** What every step of the scenario works with. */
interface Scenario {
  readonly app: App;
  readonly trace: Trace;
}

/** Creates a project from Template A and renames it; returns its ID. */
async function createAndRename({ app, trace }: Scenario): Promise<string> {
  trace.useCase(`CreateProjectFromTemplate.execute("template-a")`);
  const created = await app.createProject.execute("template-a");
  if (created.status !== "created") throw new Error(created.status);
  trace.result(`created, ${describeRecord(created.record)}`);
  await traceStoredDocument(trace, created.record);

  trace.useCase(`SaveProject.execute(the record, renamed "Rush hour")`);
  app.clock.set(RENAMED_AT);
  const renamed = { ...created.record.project, name: "Rush hour" };
  const saved = await app.saveProject.execute({
    ...created.record,
    project: renamed,
  });
  trace.result(saved.status);

  trace.useCase("ListProjects.execute()");
  const listed = await app.listProjects.execute();
  trace.result(`${String(listed.length)} project`);
  return created.record.project.id;
}

async function openAndRun({ app, trace }: Scenario, id: string) {
  trace.useCase(`OpenProject.execute("${id}")`);
  const opened = await app.openProject.execute(id);
  if (opened.status !== "found") throw new Error(opened.status);
  trace.result(`found, ${describeRecord(opened.record)}`);

  trace.useCase(
    `RunSimulation.execute({ project (cut to 3 s), seed: 7, onSnapshot })`,
  );
  const result = await app.runSimulation.execute({
    project: shortened(opened.record.project),
    seed: 7,
    onSnapshot: (s) => {
      trace.note(`onSnapshot  ${String(s.startMs)}–${String(s.endMs)} ms`);
    },
  });
  if (result.status !== "finished") throw new Error(result.status);
  trace.result(
    `finished, workload "${result.workload.id}" with seed ${String(result.workload.seed)}`,
  );
  trace.note(`totals: ${describeTotals(result.run)}`);
}

/** Rewrites the stored document as a newer build would, then tries to open it. */
async function openFromNewerBuild({ app, trace }: Scenario, id: string) {
  trace.useCase(
    "(a newer build stored the document as schemaVersion 2; this build reads only 1)",
  );
  const stored = await database.get("projects", id);
  await database.put("projects", { ...stored, schemaVersion: 2 });

  trace.useCase("ListProjects.execute()");
  await app.listProjects.execute();
  trace.note("still listed: list() reads only the summary fields");

  trace.useCase(`OpenProject.execute("${id}")`);
  const unreadable = await app.openProject.execute(id);
  if (unreadable.status !== "invalid") throw new Error(unreadable.status);
  trace.result(`invalid: "${unreadable.reason}"`);
  for (const issue of unreadable.issues) {
    trace.note(`issue    ${issue.path.join(".")}: ${issue.message}`);
  }
}

async function deleteAndList({ app, trace }: Scenario, id: string) {
  trace.useCase(`DeleteProject.execute("${id}")`);
  await app.deleteProject.execute(id);
  trace.useCase("ListProjects.execute()");
  await app.listProjects.execute();
}

it("traces a project from a template through save, open, run, a failed load, and delete", async () => {
  const trace = new Trace();
  const scenario = { app: wireUseCases(trace), trace };

  const id = await createAndRename(scenario);
  await openAndRun(scenario, id);
  await openFromNewerBuild(scenario, id);
  await deleteAndList(scenario, id);

  await expect(trace.toString()).toMatchFileSnapshot("application-layer.txt");
});
