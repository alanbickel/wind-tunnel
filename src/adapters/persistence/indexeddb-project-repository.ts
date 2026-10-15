import { z } from "zod";
import type { ComponentRegistry } from "../../domain/components/component-registry";
import type {
  ProjectRecord,
  ProjectSummary,
} from "../../application/ports/project-record";
import type {
  ProjectLookup,
  ProjectRepository,
} from "../../application/ports/project-repository";
import type { UncheckedDocument } from "./document-migrations";
import { loadProject, type LoadResult } from "./load-project";
import type { ProjectDatabase } from "./project-database";
import { toProjectDocument } from "./project-document-mapper";

export interface IndexedDbProjectRepositoryInput {
  /** From `openProjectDatabase`. */
  readonly database: ProjectDatabase;
  /** Checks each component's config when a project is read. */
  readonly registry: ComponentRegistry;
}

/**
 * The `ProjectRepository` over IndexedDB (ADR-0004). It stores each record
 * as one project document, the same format as export, and reads it back
 * through `loadProject`, so a document saved by an older build is migrated
 * and every stored project is checked again before the app uses it.
 */
export class IndexedDbProjectRepository implements ProjectRepository {
  private readonly database: ProjectDatabase;
  private readonly registry: ComponentRegistry;

  constructor({ database, registry }: IndexedDbProjectRepositoryInput) {
    this.database = database;
    this.registry = registry;
  }

  async list(): Promise<ProjectSummary[]> {
    // The index sorts oldest first; the port wants newest first.
    const documents = await this.database.getAllFromIndex(
      "projects",
      "updatedAt",
    );
    return documents.reverse().map(storedSummaryOf);
  }

  async get(id: string): Promise<ProjectLookup> {
    const document = await this.database.get("projects", id);
    if (document === undefined) return { status: "missing" };
    return lookupOf(loadProject(document, this.registry));
  }

  async save(record: ProjectRecord): Promise<void> {
    await this.database.put("projects", toProjectDocument(record));
  }

  async delete(id: string): Promise<void> {
    await this.database.delete("projects", id);
  }
}

/** Shown when a stored project fails `loadProject`; the issues say why. */
export const UNREADABLE_PROJECT_REASON =
  "This project was saved in a form this version of Wind Tunnel can't open.";

function lookupOf(loaded: LoadResult): ProjectLookup {
  if (loaded.ok) return { status: "found", record: loaded.record };
  return {
    status: "invalid",
    reason: UNREADABLE_PROJECT_REASON,
    issues: loaded.issues,
  };
}

/** The name listed for a stored project whose name can't be read. */
export const UNNAMED_PROJECT = "Untitled project";

/**
 * The fields `list` needs, read without checking the rest of the document,
 * so a project that no longer loads is still listed and the user can open
 * it to see why. Every schema version keeps them at the top level. The key
 * path and the index guarantee `id` and `updatedAt`.
 */
const storedSummarySchema = z.object({
  id: z.string(),
  name: z.string().catch(UNNAMED_PROJECT),
  description: z.string().optional().catch(undefined),
  updatedAt: z.string(),
});

function storedSummaryOf(document: UncheckedDocument): ProjectSummary {
  const { description, ...summary } = storedSummarySchema.parse(document);
  return description === undefined ? summary : { ...summary, description };
}
