import type { ComponentRegistry } from "../../domain/components/component-registry";
import { validateComponents } from "../../domain/components/validate-components";
import type {
  Architecture,
  Project,
  Step,
  Workflow,
  Workload,
} from "../../domain/model/project";
import {
  validateProject,
  type ValidationIssue,
} from "../../domain/model/validate-project";
import { issuesFromZod } from "../../domain/model/zod-issues";
import {
  projectDocumentV1Schema,
  type ArchitectureDocument,
  type ProjectDocumentV1,
  type StepDocument,
  type WorkflowDocument,
  type WorkloadDocument,
} from "./project-document-v1";

/** The schema versions this build can read. */
export const CURRENT_SCHEMA_VERSION = 1;

export type LoadResult = Loaded | LoadFailed;

export interface Loaded {
  readonly ok: true;
  readonly project: Project;
  /** The parsed document, including the fields the domain doesn't keep. */
  readonly document: ProjectDocumentV1;
}

export interface LoadFailed {
  readonly ok: false;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Turns stored or imported JSON into a domain `Project`, checking it in three
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

  const project = toProject(parsed.data);
  const issues = checkProject(project, registry).map(toDocumentIssue);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, project, document: parsed.data };
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

/**
 * Domain fields with a different name in the document. The document gives
 * workload times in seconds, which people find easier to write; the domain
 * keeps every time in milliseconds.
 */
const DOCUMENT_FIELD_NAMES: Readonly<Record<string, string>> = {
  atMs: "atSec",
  durationMs: "durationSec",
};

/** The issue with its path pointing into the document, not the domain. */
function toDocumentIssue(issue: ValidationIssue): ValidationIssue {
  return {
    ...issue,
    path: issue.path.map((key) =>
      typeof key === "string" ? (DOCUMENT_FIELD_NAMES[key] ?? key) : key,
    ),
  };
}

/**
 * Maps a parsed document to domain entities. The domain's structure mirrors
 * the document's, so validation paths point at the same places in both,
 * apart from the renamed fields in `DOCUMENT_FIELD_NAMES`. Document-only
 * fields (`layout`, timestamps, `source`) are left out.
 */
export function toProject(document: ProjectDocumentV1): Project {
  return {
    id: document.id,
    name: document.name,
    ...(document.description === undefined
      ? {}
      : { description: document.description }),
    architecture: toArchitecture(document.architecture),
    workflows: document.workflows.map(toWorkflow),
    workloads: document.workloads.map(toWorkload),
  };
}

function toArchitecture(architecture: ArchitectureDocument): Architecture {
  return {
    components: architecture.components.map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      config: c.config,
    })),
    edges: architecture.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      latencyMs: e.latencyMs,
      timeoutMs: e.timeoutMs,
      retry: { ...e.retry },
    })),
  };
}

function toWorkflow(workflow: WorkflowDocument): Workflow {
  return { id: workflow.id, name: workflow.name, root: toStep(workflow.root) };
}

function toWorkload(workload: WorkloadDocument): Workload {
  return {
    id: workload.id,
    name: workload.name,
    durationMs: workload.durationSec * 1000,
    seed: workload.seed,
    mix: workload.mix.map((m) => ({ ...m })),
    profile: workload.profile.map((p) => ({
      atMs: p.atSec * 1000,
      requestsPerSec: p.requestsPerSec,
    })),
  };
}

function toStep(step: StepDocument): Step {
  return {
    componentId: step.componentId,
    action: step.action,
    ...(step.calls === undefined ? {} : { calls: step.calls.map(toStep) }),
    ...(step.async === undefined ? {} : { async: toStep(step.async) }),
  };
}

/** Any document, before its schema version says which schema applies. */
interface VersionedDocument {
  readonly schemaVersion?: unknown;
}

function schemaVersionOf(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return undefined;
  return (input as VersionedDocument).schemaVersion;
}
