import type { EdgeSettings } from "../../domain/model/edge-settings";
import type { Edge } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";

// Edge commands (ADR-0019, decision 4): edges belong to the architecture,
// so they're drawn, edited, and removed on their own, whether or not a step
// calls along them. Like the component commands, they don't check the
// change: the canvas and "Connect to…" offer only edges the architecture
// allows, a field checks its draft, and `SaveProject` checks the record. A
// command for an edge the project doesn't have returns the record
// unchanged, except `connectComponents`.

/** A new edge: its id, its ends, and its caller type's edge defaults. */
export interface ConnectComponentsInput {
  /** A new id, from the `IdGenerator` port. */
  readonly edgeId: string;
  /** The caller's component id. */
  readonly from: string;
  /** The callee's component id. */
  readonly to: string;
  /** The caller type's `edgeDefaults`, which become the edge's settings. */
  readonly settings: EdgeSettings;
}

/** Adds an edge from one component to another, with the settings given. */
export function connectComponents(
  record: ProjectRecord,
  { edgeId, from, to, settings }: ConnectComponentsInput,
): ProjectRecord {
  const edge: Edge = { id: edgeId, from, to, ...settings };
  return changeEdges(record, (edges) => [...edges, edge]);
}

/** One of an edge's settings, by its key. */
export type EdgeSettingKey = keyof EdgeSettings;

/** One setting of one edge, and its new value. */
export interface SetEdgeSettingInput {
  readonly edgeId: string;
  readonly key: EdgeSettingKey;
  /** As the edge stores it: a number in ms, or a `RetryPolicy`. */
  readonly value: unknown;
}

/** Sets one of an edge's settings: its latency, timeout, or retry policy. */
export function setEdgeSetting(
  record: ProjectRecord,
  { edgeId, key, value }: SetEdgeSettingInput,
): ProjectRecord {
  if (!hasEdge(record, edgeId)) return record;
  return changeEdges(record, (edges) =>
    edges.map((edge) =>
      edge.id === edgeId ? { ...edge, [key]: value } : edge,
    ),
  );
}

/** One setting of one edge, and its caller type's edge defaults. */
export interface ResetEdgeSettingInput {
  readonly edgeId: string;
  readonly key: EdgeSettingKey;
  /** The caller type's `edgeDefaults`. */
  readonly defaults: EdgeSettings;
}

/** Sets an edge's setting to its caller type's default. */
export function resetEdgeSetting(
  record: ProjectRecord,
  { edgeId, key, defaults }: ResetEdgeSettingInput,
): ProjectRecord {
  return setEdgeSetting(record, { edgeId, key, value: defaults[key] });
}

/** An edge to remove. */
export interface RemoveEdgeInput {
  readonly edgeId: string;
}

/**
 * Removes an edge. Workflow steps that call along it stay as they are;
 * they become run issues, which stop only the workloads that use them.
 */
export function removeEdge(
  record: ProjectRecord,
  { edgeId }: RemoveEdgeInput,
): ProjectRecord {
  if (!hasEdge(record, edgeId)) return record;
  return changeEdges(record, (edges) => edges.filter((e) => e.id !== edgeId));
}

function hasEdge(record: ProjectRecord, edgeId: string): boolean {
  return record.project.architecture.edges.some((e) => e.id === edgeId);
}

/** The record with its edges changed. */
function changeEdges(
  record: ProjectRecord,
  change: (edges: readonly Edge[]) => readonly Edge[],
): ProjectRecord {
  const { project } = record;
  const { architecture } = project;
  const edges = change(architecture.edges);
  return {
    ...record,
    project: { ...project, architecture: { ...architecture, edges } },
  };
}
