import type { ComponentRegistry } from "../../domain/components/component-registry";
import { findArchitectureIssues } from "../../domain/components/find-architecture-issues";
import type { ProjectRecord } from "../../application/ports/project-record";
import type { ValidationIssue } from "../../domain/model/validation-issue";
import { issuesFromZod } from "../../domain/model/zod-issues";
import { projectDocumentV1Schema } from "./project-document-v1";
import { toDocumentIssue, toProjectRecord } from "./project-document-mapper";
import { DOCUMENT_MIGRATIONS, migrateDocument } from "./document-migrations";

export type LoadResult = Loaded | LoadFailed;

export interface Loaded {
  readonly ok: true;
  readonly record: ProjectRecord;
}

export interface LoadFailed {
  readonly ok: false;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Turns stored or imported JSON into a `ProjectRecord`. It first brings an
 * older document up to the current schema version (`migrateDocument`),
 * refusing one it can't, then checks it in three stages (MVP design §6,
 * "Load-time checks"):
 *
 * 1. The document's shape and number ranges (`projectDocumentV1Schema`).
 * 2. The architecture's type-independent rules: unique IDs, and edges
 *    between components that exist (`validateArchitecture`).
 * 3. Its rules for each component type: known types, valid configs, unique
 *    names (`validateComponents`).
 *
 * Stages 2 and 3 run together, once the schema passes. Every issue in the
 * failing stage is returned, with paths into the document. Run issues, in
 * the workflows and workloads, don't stop a project opening; they stop a
 * run of the workloads they affect (ADR-0019, decision 2).
 */
export function loadProject(
  input: unknown,
  registry: ComponentRegistry,
): LoadResult {
  const migrated = migrateDocument(input, DOCUMENT_MIGRATIONS);
  if (!migrated.ok) return { ok: false, issues: [migrated.issue] };

  const parsed = projectDocumentV1Schema.safeParse(migrated.document);
  if (!parsed.success) {
    return { ok: false, issues: issuesFromZod(parsed.error) };
  }

  const record = toProjectRecord(parsed.data);
  const issues = findArchitectureIssues(record.project, registry).map(
    toDocumentIssue,
  );
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, record };
}
