import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import type { MetricsSnapshot } from "../../domain/metrics/metrics-collector";
import type { Project } from "../../domain/model/project";
import { FixedClock } from "../../application/testing/fixed-clock";
import { SequentialIds } from "../../application/testing/sequential-ids";
import { CreateProjectFromTemplate } from "../../application/use-cases/create-project-from-template";
import { DeleteProject } from "../../application/use-cases/delete-project";
import { ListProjects } from "../../application/use-cases/list-projects";
import { ListTemplates } from "../../application/use-cases/list-templates";
import { OpenProject } from "../../application/use-cases/open-project";
import { RunSimulation } from "../../application/use-cases/run-simulation";
import { SaveProject } from "../../application/use-cases/save-project";
import { InProcessSimulationRunner } from "../simulation/in-process-simulation-runner";
import { createBundledTemplateCatalog } from "../templates/bundled-template-catalog";
import { IndexedDbProjectRepository } from "./indexed-db-project-repository";
import { openProjectDatabase, type ProjectDatabase } from "./project-database";

// The MVP use cases wired to the real adapters: IndexedDB (through
// fake-indexeddb), the bundled templates, and the in-process runner. The use case tests in
// `application/` use fakes; this checks the adapters keep their promises.

const CREATED_AT = "2026-10-15T12:00:00.000Z";
const SAVED_AT = "2026-10-15T12:05:00.000Z";

const registry = createAwsComponentRegistry();
const templates = createBundledTemplateCatalog(registry);

let database: ProjectDatabase;

beforeEach(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  database = await openProjectDatabase();
});

afterEach(() => {
  database.close();
  vi.unstubAllGlobals();
});

function useCases() {
  const projects = new IndexedDbProjectRepository({ database, registry });
  const clock = new FixedClock(CREATED_AT);
  const ids = new SequentialIds("project");
  return {
    clock,
    listTemplates: new ListTemplates({ templates }),
    createProject: new CreateProjectFromTemplate({
      templates,
      projects,
      clock,
      ids,
    }),
    listProjects: new ListProjects({ projects }),
    openProject: new OpenProject({ projects }),
    saveProject: new SaveProject({ projects, clock, registry }),
    deleteProject: new DeleteProject({ projects }),
    runSimulation: new RunSimulation({
      runner: new InProcessSimulationRunner({ registry }),
    }),
  };
}

/** The project with each workload cut to its first five seconds, so tests run fast. */
function shortened(project: Project): Project {
  const workloads = project.workloads.map((w) => ({ ...w, durationMs: 5_000 }));
  return { ...project, workloads };
}

describe("MVP use cases over IndexedDB, the bundled templates, and the in-process runner", () => {
  it("create, list, open, rename, save, and delete a project from every template", async () => {
    const app = useCases();

    for (const template of await app.listTemplates.execute()) {
      const created = await app.createProject.execute(template.id);
      if (created.status !== "created") throw new Error(created.status);
      const { id } = created.record.project;
      expect(created.record.source).toEqual({
        templateId: template.id,
        templateVersion: template.version,
      });

      const opened = await app.openProject.execute(id);
      expect(opened).toEqual({ status: "found", record: created.record });

      app.clock.set(SAVED_AT);
      const project = { ...created.record.project, name: "Renamed" };
      const saved = await app.saveProject.execute({
        ...created.record,
        project,
      });
      expect(saved.status).toBe("saved");
      expect(await app.listProjects.execute()).toEqual([
        {
          id,
          name: "Renamed",
          description: project.description,
          updatedAt: SAVED_AT,
        },
      ]);

      await app.deleteProject.execute(id);
      expect(await app.openProject.execute(id)).toEqual({ status: "missing" });
      app.clock.set(CREATED_AT);
    }
  });

  it("lists projects from several templates, most recently updated first", async () => {
    const app = useCases();
    const [first, second] = await app.listTemplates.execute();
    if (first === undefined || second === undefined) {
      throw new Error("Expected two templates");
    }

    await app.createProject.execute(first.id);
    app.clock.set(SAVED_AT);
    await app.createProject.execute(second.id);

    expect((await app.listProjects.execute()).map((s) => s.name)).toEqual([
      second.name,
      first.name,
    ]);
  });

  it("runs a saved project's workload with a seed override, streaming its snapshots", async () => {
    const app = useCases();

    for (const template of await app.listTemplates.execute()) {
      const created = await app.createProject.execute(template.id);
      if (created.status !== "created") throw new Error(created.status);
      const opened = await app.openProject.execute(created.record.project.id);
      if (opened.status !== "found") throw new Error(opened.status);
      const received: MetricsSnapshot[] = [];

      const result = await app.runSimulation.execute({
        project: shortened(opened.record.project),
        seed: 7,
        onSnapshot: (snapshot) => received.push(snapshot),
      });

      if (result.status !== "finished") throw new Error(result.status);
      expect(result.workload.seed).toBe(7);
      expect(result.run.snapshots).toHaveLength(5);
      expect(received).toEqual(result.run.snapshots);
      const started = Object.values(result.run.totals.workflows).map(
        (w) => w.started,
      );
      expect(Math.min(...started)).toBeGreaterThan(0);
    }
  });
});
