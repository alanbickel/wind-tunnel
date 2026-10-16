import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { checkProjectRepositoryContract } from "../../application/testing/check-project-repository-contract";
import { sampleRecord } from "../../application/testing/sample-record";
import { createBundledTemplateCatalog } from "../templates/bundled-template-catalog";
import {
  IndexedDbProjectRepository,
  UNNAMED_PROJECT,
  UNREADABLE_PROJECT_REASON,
} from "./indexed-db-project-repository";
import {
  PROJECT_DATABASE_NAME,
  PROJECT_DATABASE_VERSION,
  openProjectDatabase,
  type ProjectDatabase,
} from "./project-database";
import { toProjectDocument } from "./project-document-mapper";

const registry = createAwsComponentRegistry();

let database: ProjectDatabase;
let repository: IndexedDbProjectRepository;

beforeEach(async () => {
  // A fresh, empty IndexedDB for every test.
  vi.stubGlobal("indexedDB", new IDBFactory());
  database = await openProjectDatabase();
  repository = new IndexedDbProjectRepository({ database, registry });
});

afterEach(() => {
  database.close();
  vi.unstubAllGlobals();
});

describe("openProjectDatabase", () => {
  it("creates version 1: a projects store keyed by id, indexed by updatedAt", () => {
    expect(database.name).toBe(PROJECT_DATABASE_NAME);
    expect(database.version).toBe(PROJECT_DATABASE_VERSION);
    expect([...database.objectStoreNames]).toEqual(["projects"]);

    const projects = database.transaction("projects").store;
    expect(projects.keyPath).toBe("id");
    expect([...projects.indexNames]).toEqual(["updatedAt"]);
    expect(projects.index("updatedAt").keyPath).toBe("updatedAt");
  });
});

describe("IndexedDbProjectRepository", () => {
  it("passes the repository contract", async () => {
    expect(
      await checkProjectRepositoryContract(repository, sampleRecord),
    ).toEqual([]);
  });

  it("stores each record as its project document", async () => {
    await repository.save(sampleRecord);
    expect(await database.get("projects", sampleRecord.project.id)).toEqual(
      toProjectDocument(sampleRecord),
    );
  });

  it("returns both templates unchanged after saving them", async () => {
    const catalog = createBundledTemplateCatalog(registry);
    for (const { id } of await catalog.list()) {
      const template = await catalog.get(id);
      if (template === undefined) throw new Error(`No template ${id}`);
      await repository.save(template);
      expect(await repository.get(id)).toEqual({
        status: "found",
        record: template,
      });
    }
  });

  it("reports a stored project that fails validation as invalid, with the issues", async () => {
    const document = toProjectDocument(sampleRecord);
    await database.put("projects", {
      ...document,
      architecture: {
        ...document.architecture,
        components: document.architecture.components.map((c) => ({
          ...c,
          type: "mainframe",
        })),
      },
    });

    const lookup = await repository.get(sampleRecord.project.id);
    expect(lookup).toMatchObject({
      status: "invalid",
      reason: UNREADABLE_PROJECT_REASON,
    });
    expect(lookup.status === "invalid" && lookup.issues.length).toBeGreaterThan(
      0,
    );
  });

  it("reports a project saved by a newer version as invalid, and still lists it", async () => {
    const newer = { ...toProjectDocument(sampleRecord), schemaVersion: 99 };
    await database.put("projects", newer);

    expect(await repository.get(newer.id)).toMatchObject({
      status: "invalid",
      reason: UNREADABLE_PROJECT_REASON,
      issues: [{ path: ["schemaVersion"] }],
    });
    expect((await repository.list()).map((s) => s.id)).toEqual([newer.id]);
  });

  it("lists a stored project whose name can't be read as untitled", async () => {
    const { id, updatedAt } = toProjectDocument(sampleRecord);
    await database.put("projects", { id, updatedAt, name: 42 });

    expect(await repository.list()).toEqual([
      { id, name: UNNAMED_PROJECT, updatedAt },
    ]);
  });
});
