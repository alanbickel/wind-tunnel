import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { UncheckedDocument } from "./document-migrations";

// The browser database that holds the user's projects (ADR-0004, MVP design
// §6). Two kinds of version apply here: the database version below covers
// stores and indexes, and each document's `schemaVersion` covers its shape.

export const PROJECT_DATABASE_NAME = "wind-tunnel";
export const PROJECT_DATABASE_VERSION = 1;

/**
 * The stores and indexes. Values are documents of whatever schema version
 * wrote them, so they're unchecked until `loadProject` reads them.
 */
export interface ProjectDatabaseSchema extends DBSchema {
  projects: {
    /** The document's `id`. */
    key: string;
    value: UncheckedDocument;
    indexes: {
      /** ISO 8601 strings, which sort by time (ADR-0008). */
      updatedAt: string;
    };
  };
}

export type ProjectDatabase = IDBPDatabase<ProjectDatabaseSchema>;

/** Opens the database, creating or upgrading its stores first if needed. */
export function openProjectDatabase(): Promise<ProjectDatabase> {
  return openDB<ProjectDatabaseSchema>(
    PROJECT_DATABASE_NAME,
    PROJECT_DATABASE_VERSION,
    { upgrade: createVersion1 },
  );
}

/**
 * Version 1: the `projects` store. A later version adds its own step, run
 * when the database's old version is below it (the `upgrade` callback's
 * second argument), so a database at any older version catches up.
 */
function createVersion1(database: ProjectDatabase): void {
  const projects = database.createObjectStore("projects", { keyPath: "id" });
  projects.createIndex("updatedAt", "updatedAt");
}
