import type { ComponentRegistry } from "../../domain/components/component-registry";
import { validateComponents } from "../../domain/components/validate-components";
import type { Project } from "../../domain/model/project";
import type { ProjectRecord } from "../../application/ports/project-record";
import {
  validateProject,
  type ValidationIssue,
} from "../../domain/model/validate-project";
import { issuesFromZod } from "../../domain/model/zod-issues";
import { projectDocumentV1Schema } from "./project-document-v1";
import { toDocumentIssue, toProjectRecord } from "./project-document-mapper";

/** The schema versions this build can read. */
export const CURRENT_SCHEMA_VERSION = 1;

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
 * Turns stored or imported JSON into a `ProjectRecord`, checking it in three
 * stages (MVP design §6, "Load-time checks"):
 *
 * 1. The document's shape and number ranges (`projectDocumentV1Schema`).
 * 2. Rules across the project: unique IDs, references, steps following edges
 *    (`validateProject`).
 * 3. Rules for each component type: known types, valid configs, accepted
 *    actions (`validateComponents`).
 *
 * Each stage runs only if the previous one passed, because later checks
 * assume the earlier ones hold. Every issue in the failing stage is
 * returned, with paths into the document.
 */
export function loadProject(
  input: unknown,
  registry: ComponentRegistry,
): LoadResult {
  const versionIssue = checkSchemaVersion(input);
  if (versionIssue !== undefined) return { ok: false, issues: [versionIssue] };

  const parsed = projectDocumentV1Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: issuesFromZod(parsed.error) };
  }

  const record = toProjectRecord(parsed.data);
  const issues = checkProject(record.project, registry).map(toDocumentIssue);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, record };
}

/** Stage 0: an issue if this build can't read the document's version. */
function checkSchemaVersion(input: unknown): ValidationIssue | undefined {
  const version = schemaVersionOf(input);
  if (version === CURRENT_SCHEMA_VERSION) return undefined;
  return {
    path: ["schemaVersion"],
    message:
      version === undefined
        ? "This isn't a Wind Tunnel project: it has no schemaVersion."
        : `Unsupported schema version ${JSON.stringify(version)}; this version of Wind Tunnel reads version ${String(CURRENT_SCHEMA_VERSION)}.`,
  };
}

/** Stages 2 and 3: the issues from the first stage that finds any. */
function checkProject(
  project: Project,
  registry: ComponentRegistry,
): readonly ValidationIssue[] {
  const issues = validateProject(project);
  if (issues.length > 0) return issues;
  return validateComponents(project, registry);
}

/** Any document, before its schema version says which schema applies. */
interface VersionedDocument {
  readonly schemaVersion?: unknown;
}

function schemaVersionOf(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return undefined;
  return (input as VersionedDocument).schemaVersion;
}
