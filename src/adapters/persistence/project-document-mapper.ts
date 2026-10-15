import type {
  Architecture,
  Project,
  Step,
  Workflow,
  Workload,
} from "../../domain/model/project";
import type { ValidationIssue } from "../../domain/model/validate-project";
import type { ProjectRecord } from "../../application/ports/project-record";
import type {
  ArchitectureDocument,
  ProjectDocumentV1,
  StepDocument,
  WorkflowDocument,
  WorkloadDocument,
} from "./project-document-v1";

// Maps between the stored document (version 1) and the application's
// `ProjectRecord` (ADR-0008). The two have the same structure, so validation
// paths into the domain point at the same places in the document, with one
// exception: the document gives workload times in seconds, which people find
// easier to write, and the domain keeps every time in milliseconds.
//
// Both directions copy rather than share arrays, so a record and the document
// made from it can't change each other.

const MS_PER_SEC = 1000;

/**
 * Domain fields with a different name in the document, because the document
 * gives them in seconds.
 */
const DOCUMENT_FIELD_NAMES: Readonly<Record<string, string>> = {
  atMs: "atSec",
  durationMs: "durationSec",
};

/** The issue with its path pointing into the document, not the domain. */
export function toDocumentIssue(issue: ValidationIssue): ValidationIssue {
  return {
    ...issue,
    path: issue.path.map((key) =>
      typeof key === "string" ? (DOCUMENT_FIELD_NAMES[key] ?? key) : key,
    ),
  };
}

/** A parsed document as a record: the domain `Project` plus document-only facts. */
export function toProjectRecord(document: ProjectDocumentV1): ProjectRecord {
  return {
    project: toProject(document),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    ...(document.source === undefined
      ? {}
      : { source: { ...document.source } }),
    layout: { nodes: { ...document.layout.nodes } },
  };
}

/** A record as a version 1 document, ready to store or export. */
export function toProjectDocument(record: ProjectRecord): ProjectDocumentV1 {
  const { project } = record;
  return {
    schemaVersion: 1,
    id: project.id,
    name: project.name,
    ...(project.description === undefined
      ? {}
      : { description: project.description }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.source === undefined ? {} : { source: { ...record.source } }),
    architecture: toArchitectureDocument(project.architecture),
    workflows: project.workflows.map(toWorkflowDocument),
    workloads: project.workloads.map(toWorkloadDocument),
    layout: { nodes: { ...record.layout.nodes } },
  };
}

// Document to domain

function toProject(document: ProjectDocumentV1): Project {
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

function toStep(step: StepDocument): Step {
  return {
    componentId: step.componentId,
    action: step.action,
    ...(step.calls === undefined ? {} : { calls: step.calls.map(toStep) }),
    ...(step.async === undefined ? {} : { async: toStep(step.async) }),
  };
}

function toWorkload(workload: WorkloadDocument): Workload {
  return {
    id: workload.id,
    name: workload.name,
    durationMs: workload.durationSec * MS_PER_SEC,
    seed: workload.seed,
    mix: workload.mix.map((m) => ({ ...m })),
    profile: workload.profile.map((p) => ({
      atMs: p.atSec * MS_PER_SEC,
      requestsPerSec: p.requestsPerSec,
    })),
  };
}

// Domain to document

function toArchitectureDocument(
  architecture: Architecture,
): ArchitectureDocument {
  return {
    components: architecture.components.map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      config: { ...c.config },
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

function toWorkflowDocument(workflow: Workflow): WorkflowDocument {
  return {
    id: workflow.id,
    name: workflow.name,
    root: toStepDocument(workflow.root),
  };
}

function toStepDocument(step: Step): StepDocument {
  return {
    componentId: step.componentId,
    action: step.action,
    ...(step.calls === undefined
      ? {}
      : { calls: step.calls.map(toStepDocument) }),
    ...(step.async === undefined ? {} : { async: toStepDocument(step.async) }),
  };
}

function toWorkloadDocument(workload: Workload): WorkloadDocument {
  return {
    id: workload.id,
    name: workload.name,
    durationSec: workload.durationMs / MS_PER_SEC,
    seed: workload.seed,
    mix: workload.mix.map((m) => ({ ...m })),
    profile: workload.profile.map((p) => ({
      atSec: p.atMs / MS_PER_SEC,
      requestsPerSec: p.requestsPerSec,
    })),
  };
}
