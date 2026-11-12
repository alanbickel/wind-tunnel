import { rateAt } from "../../domain/engine/arrivals";
import type { ProfilePoint, Workload } from "../../domain/model/project";
import { firstFreeName } from "../details/first-free-name";
import { nameKey } from "../details/project-name";
import type { ProjectRecord } from "../ports/project-record";
import { inTimeOrder, nextPointAtMs } from "./profile-points";

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

/** A workload, and the workflow to add to its mix. */
export interface AddToMixInput {
  readonly workloadId: string;
  readonly workflowId: string;
}

/** What a new mix entry weighs: the same as any other entry that hasn't been set. */
export const NEW_MIX_WEIGHT = 1;

/**
 * Appends an entry for a workflow to a workload's mix, at weight 1. A
 * workflow the mix already has, or the project doesn't, returns the record
 * as it was: the screen offers neither, and a command shouldn't rely on its
 * caller. Undo, not a later `removeFromMix`, is what brings back an entry's
 * weight and place.
 */
export function addToMix(
  record: ProjectRecord,
  { workloadId, workflowId }: AddToMixInput,
): ProjectRecord {
  if (!record.project.workflows.some((w) => w.id === workflowId)) return record;
  return changeWorkload(record, {
    workloadId,
    change: (w) =>
      w.mix.some((entry) => entry.workflowId === workflowId)
        ? w
        : { ...w, mix: [...w.mix, { workflowId, weight: NEW_MIX_WEIGHT }] },
  });
}

/** A mix entry, by its workflow, and the weight to give it. */
export interface SetMixWeightInput {
  readonly workloadId: string;
  readonly workflowId: string;
  readonly weight: number;
}

/**
 * Sets the weight of a workload's mix entry for a workflow. Nothing else
 * changes, the entry's place included. An entry that isn't there, or the
 * weight it already has, returns the record as it was. Of a stored mix that
 * repeats a workflow, the first entry is the one it sets.
 */
export function setMixWeight(
  record: ProjectRecord,
  { workloadId, workflowId, weight }: SetMixWeightInput,
): ProjectRecord {
  return changeWorkload(record, {
    workloadId,
    change: (w) => {
      const index = w.mix.findIndex((entry) => entry.workflowId === workflowId);
      const entry = w.mix[index];
      if (entry === undefined || entry.weight === weight) return w;
      const mix = w.mix.map((e) => (e === entry ? { ...e, weight } : e));
      return { ...w, mix };
    },
  });
}

/** A mix entry to remove, by its workflow. */
export interface RemoveFromMixInput {
  readonly workloadId: string;
  readonly workflowId: string;
}

/**
 * Removes a workload's mix entry for a workflow; the other entries keep
 * their weights and order. An entry that isn't there returns the record as
 * it was. Removing the last entry leaves an empty mix, which is allowed:
 * the workload can't run until it has one. Of a stored mix that repeats a
 * workflow, the first entry is the one it removes.
 */
export function removeFromMix(
  record: ProjectRecord,
  { workloadId, workflowId }: RemoveFromMixInput,
): ProjectRecord {
  return changeWorkload(record, {
    workloadId,
    change: (w) => {
      const index = w.mix.findIndex((entry) => entry.workflowId === workflowId);
      if (index < 0) return w;
      return { ...w, mix: w.mix.filter((_, i) => i !== index) };
    },
  });
}

// A profile point is addressed by its time, what the user sees, not by its
// index: a change of time re-sorts the profile, so an index would name a
// different point afterwards. A time is unique in any profile these
// commands make, so it needs no stored id. A stored profile can have two
// points at one time, which the screen can't tell apart: the commands take
// the first, so it can be fixed by changing the first's time, or removing it.

/** A workload, and where to put a new point in its profile. */
export interface AddProfilePointInput {
  readonly workloadId: string;
  /**
   * The new point's time. `NEW_POINT_GAP_MS` after the profile's last point
   * if not given.
   */
  readonly atMs?: number;
}

/**
 * Adds a point to a workload's profile, in its place in time order, at the
 * rate the line already has at that time, so the picture doesn't change
 * until the point does. By default that's after the last point, at its rate.
 * A time another point has returns the record as it was. An empty profile
 * gets a point at the start, at the editor's new-workload rate.
 */
export function addProfilePoint(
  record: ProjectRecord,
  { workloadId, atMs }: AddProfilePointInput,
): ProjectRecord {
  return changeWorkload(record, {
    workloadId,
    change: (w) => {
      const at = atMs ?? nextPointAtMs(w.profile.map((p) => p.atMs));
      if (w.profile.some((p) => p.atMs === at)) return w;
      const ordered = inTimeOrder(w.profile);
      const requestsPerSec =
        ordered.length === 0 ? NEW_WORKLOAD_RATE_PER_SEC : rateAt(ordered, at);
      const point: ProfilePoint = { atMs: at, requestsPerSec };
      return { ...w, profile: inTimeOrder([...w.profile, point]) };
    },
  });
}

/** What to change about a point: its time, its rate, or both. */
export type ProfilePointChange = Partial<ProfilePoint>;

/** A point, by its time, and what to change about it. */
export interface SetProfilePointInput {
  readonly workloadId: string;
  /** The point's time now. */
  readonly atMs: number;
  readonly change: ProfilePointChange;
}

/**
 * Changes a point's time or its rate. A new time moves the point, with its
 * rate, to its place in time order; the other points keep their own times
 * and rates. A missing workload or point, a change to what it has, or a
 * time another point has (a line can't have two rates at one moment)
 * returns the record as it was.
 */
export function setProfilePoint(
  record: ProjectRecord,
  { workloadId, atMs, change }: SetProfilePointInput,
): ProjectRecord {
  return changeWorkload(record, {
    workloadId,
    change: (w) => {
      const found = w.profile.find((p) => p.atMs === atMs);
      if (found === undefined) return w;
      const next = { ...found, ...change };
      if (
        next.atMs === found.atMs &&
        next.requestsPerSec === found.requestsPerSec
      ) {
        return w;
      }
      if (next.atMs === found.atMs) {
        // Same time: the point keeps its place, even beside a stored twin.
        return {
          ...w,
          profile: inTimeOrder(w.profile.map((p) => (p === found ? next : p))),
        };
      }
      const others = w.profile.filter((p) => p !== found);
      if (others.some((p) => p.atMs === next.atMs)) return w;
      return { ...w, profile: inTimeOrder([...others, next]) };
    },
  });
}

/** A point to remove, by its time. */
export interface RemoveProfilePointInput {
  readonly workloadId: string;
  readonly atMs: number;
}

/**
 * Removes a point from a workload's profile. A profile needs at least one
 * point, so the only point stays, and so does a point that isn't there: the
 * record comes back as it was.
 */
export function removeProfilePoint(
  record: ProjectRecord,
  { workloadId, atMs }: RemoveProfilePointInput,
): ProjectRecord {
  return changeWorkload(record, {
    workloadId,
    change: (w) => {
      const found = w.profile.find((p) => p.atMs === atMs);
      if (found === undefined || w.profile.length === 1) return w;
      return { ...w, profile: w.profile.filter((p) => p !== found) };
    },
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
