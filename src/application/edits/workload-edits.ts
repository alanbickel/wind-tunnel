import type { Workload } from "../../domain/model/project";
import { firstFreeName } from "../details/first-free-name";
import { nameKey } from "../details/project-name";
import type { ProjectRecord } from "../ports/project-record";

// Edit commands (ADR-0019): each takes the project record and returns the
// next one, doing the whole change, so it's one undo step. They don't
// check the change: a field checks its draft first, and `SaveProject`
// checks the record it saves. A command for a workload the project
// doesn't have returns the record unchanged, except `addWorkload`.

/**
 * What a new workload starts with. The editor's own choices, an
 * assumption, not a claim about any system: a minute is long enough to see
 * a steady rate, 42 is the seed the templates use, and 100 requests/s is a
 * round rate that most architectures can serve. `addWorkload` is the only
 * place that writes them.
 */
export const NEW_WORKLOAD_DURATION_MS = 60_000;
export const NEW_WORKLOAD_SEED = 42;
export const NEW_WORKLOAD_RATE_PER_SEC = 100;

/** A new workload: its id. */
export interface AddWorkloadInput {
  /** A new id, from the `IdGenerator` port. */
  readonly workloadId: string;
}

/**
 * Adds a workload after the project's others, named "workload-1" or the
 * first number no workload uses, as the name check compares names. It has
 * the editor's defaults and an empty mix, so the project can't run it
 * until the user adds a workflow to the mix (UX design §2.7). It's
 * complete the moment it's added, so there's no draft to hold.
 */
export function addWorkload(
  record: ProjectRecord,
  { workloadId }: AddWorkloadInput,
): ProjectRecord {
  const { project } = record;
  const taken = project.workloads.map((w) => nameKey(w.name));
  const workload: Workload = {
    id: workloadId,
    name: firstFreeName({ prefix: "workload", taken }),
    durationMs: NEW_WORKLOAD_DURATION_MS,
    seed: NEW_WORKLOAD_SEED,
    mix: [],
    profile: [{ atMs: 0, requestsPerSec: NEW_WORKLOAD_RATE_PER_SEC }],
  };
  return {
    ...record,
    project: { ...project, workloads: [...project.workloads, workload] },
  };
}

/** A workload, and its new name. */
export interface RenameWorkloadInput {
  readonly workloadId: string;
  readonly name: string;
}

/**
 * Renames a workload. Nothing refers to it by name, so nothing else
 * changes. The same name returns the record as it was.
 */
export function renameWorkload(
  record: ProjectRecord,
  { workloadId, name }: RenameWorkloadInput,
): ProjectRecord {
  const { project } = record;
  const found = project.workloads.find((w) => w.id === workloadId);
  if (found === undefined || found.name === name) return record;
  const rename = (w: Workload): Workload =>
    w.id === workloadId ? { ...w, name } : w;
  return {
    ...record,
    project: { ...project, workloads: project.workloads.map(rename) },
  };
}

/** A workload to remove. */
export interface RemoveWorkloadInput {
  readonly workloadId: string;
}

/**
 * Removes a workload. The workflows its mix named stay as they are. Undo
 * needs nothing more: the history keeps the record from before, so the
 * workload comes back whole, at its place in the list.
 */
export function removeWorkload(
  record: ProjectRecord,
  { workloadId }: RemoveWorkloadInput,
): ProjectRecord {
  const { project } = record;
  if (!project.workloads.some((w) => w.id === workloadId)) return record;
  return {
    ...record,
    project: {
      ...project,
      workloads: project.workloads.filter((w) => w.id !== workloadId),
    },
  };
}

/** A workload, and how to change it. */
interface ChangeWorkloadInput {
  readonly workloadId: string;
  /** Returns the workload itself if there's nothing to change. */
  readonly change: (workload: Workload) => Workload;
}

/** A workload, and the duration to give it. */
export interface SetWorkloadDurationInput {
  readonly workloadId: string;
  readonly durationMs: number;
}

/**
 * Sets how long a workload's run lasts. Nothing else changes, the profile
 * included: a point now past the end stays (UX design §5). The value it
 * already has returns the record as it was.
 */
export function setWorkloadDuration(
  record: ProjectRecord,
  { workloadId, durationMs }: SetWorkloadDurationInput,
): ProjectRecord {
  return changeWorkload(record, {
    workloadId,
    change: (w) => (w.durationMs === durationMs ? w : { ...w, durationMs }),
  });
}

/** A workload, and the seed to give it. */
export interface SetWorkloadSeedInput {
  readonly workloadId: string;
  readonly seed: number;
}

/**
 * Sets a workload's seed. Nothing else changes. The value it already has
 * returns the record as it was.
 */
export function setWorkloadSeed(
  record: ProjectRecord,
  { workloadId, seed }: SetWorkloadSeedInput,
): ProjectRecord {
  return changeWorkload(record, {
    workloadId,
    change: (w) => (w.seed === seed ? w : { ...w, seed }),
  });
}

/**
 * The record with one workload replaced by what `change` makes of it. If
 * the project has no such workload, or `change` returns it as it was, the
 * record comes back as it was.
 */
function changeWorkload(
  record: ProjectRecord,
  { workloadId, change }: ChangeWorkloadInput,
): ProjectRecord {
  const { project } = record;
  const found = project.workloads.find((w) => w.id === workloadId);
  if (found === undefined) return record;
  const changed = change(found);
  if (changed === found) return record;
  const workloads = project.workloads.map((w) => (w === found ? changed : w));
  return { ...record, project: { ...project, workloads } };
}
