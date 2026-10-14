import type { ComponentRegistry } from "../../domain/components/component-registry";
import { validateComponents } from "../../domain/components/validate-components";
import type { Project, Step } from "../../domain/model/project";
import {
  validateProject,
  type ValidationIssue,
} from "../../domain/model/validate-project";
import {
  projectDocumentV1Schema,
  type ProjectDocumentV1,
  type StepDocument,
} from "./project-document-v1";

/** The schema versions this build can read. */
export const CURRENT_SCHEMA_VERSION = 1;

export type LoadResult =
  | {
      readonly ok: true;
      readonly project: Project;
      /** The parsed document, including the fields the domain doesn't keep. */
      readonly document: ProjectDocumentV1;
    }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

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
  const version = schemaVersionOf(input);
  if (version !== CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        {
          path: ["schemaVersion"],
          message:
            version === undefined
              ? "This isn't a Wind Tunnel project: it has no schemaVersion."
              : `Unsupported schema version ${JSON.stringify(version)}; this version of Wind Tunnel reads version ${String(CURRENT_SCHEMA_VERSION)}.`,
        },
      ],
    };
  }

  const parsed = projectDocumentV1Schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map((key) =>
          typeof key === "number" ? key : String(key),
        ),
        message: issue.message,
      })),
    };
  }

  const project = toProject(parsed.data);
  const issues = validateProject(project);
  if (issues.length > 0) return { ok: false, issues };
  const typeIssues = validateComponents(project, registry);
  if (typeIssues.length > 0) return { ok: false, issues: typeIssues };
  return { ok: true, project, document: parsed.data };
}

/**
 * Maps a parsed document to domain entities. The domain's structure mirrors
 * the document's, so validation paths point at the same places in both.
 * Document-only fields (`layout`, timestamps, `source`) are left out.
 */
export function toProject(document: ProjectDocumentV1): Project {
  return {
    id: document.id,
    name: document.name,
    ...(document.description === undefined
      ? {}
      : { description: document.description }),
    architecture: {
      components: document.architecture.components.map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        config: c.config,
      })),
      edges: document.architecture.edges.map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        latencyMs: e.latencyMs,
        timeoutMs: e.timeoutMs,
        retry: { ...e.retry },
      })),
    },
    workflows: document.workflows.map((w) => ({
      id: w.id,
      name: w.name,
      root: toStep(w.root),
    })),
    workloads: document.workloads.map((w) => ({
      id: w.id,
      name: w.name,
      durationSec: w.durationSec,
      seed: w.seed,
      mix: w.mix.map((m) => ({ ...m })),
      profile: w.profile.map((p) => ({ ...p })),
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

function schemaVersionOf(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return undefined;
  return (input as { schemaVersion?: unknown }).schemaVersion;
}
