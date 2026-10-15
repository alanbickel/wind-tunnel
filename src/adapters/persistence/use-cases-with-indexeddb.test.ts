import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import {
  FixedClock,
  SequentialIds,
} from "../../application/testing/fake-ports";
import { CreateProjectFromTemplate } from "../../application/use-cases/create-project-from-template";
import { DeleteProject } from "../../application/use-cases/delete-project";
import { ListProjects } from "../../application/use-cases/list-projects";
import { ListTemplates } from "../../application/use-cases/list-templates";
import { OpenProject } from "../../application/use-cases/open-project";
import { SaveProject } from "../../application/use-cases/save-project";
import { createBundledTemplateCatalog } from "../templates/bundled-template-catalog";
import { IndexedDbProjectRepository } from "./indexeddb-project-repository";
import { openProjectDatabase, type ProjectDatabase } from "./project-database";

// The project use cases wired to the real adapters: IndexedDB (through
// fake-indexeddb) and the bundled templates. The use case tests in
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
  };
}

describe("project use cases over IndexedDB and the bundled templates", () => {
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
});
