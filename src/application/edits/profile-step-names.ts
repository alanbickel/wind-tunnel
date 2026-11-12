// What each profile command is called as an undo step, and what a move says
// aloud. A time is said in the seconds the user reads: "50 s".

/** A time in milliseconds as seconds, e.g. "50 s". */
function secondsText(timeMs: number): string {
  return `${String(timeMs / 1000)} s`;
}

/** A workload, and the time of the point added to its profile. */
export interface AddedPointNameInput {
  readonly workloadName: string;
  readonly atMs: number;
}

/** "Add a point at 10 s to Lunch rush's profile". */
export function addedPointName({
  workloadName,
  atMs,
}: AddedPointNameInput): string {
  return `Add a point at ${secondsText(atMs)} to ${workloadName}'s profile`;
}

/** A workload, a point's time, and its new rate. */
export interface RateChangeNameInput {
  readonly workloadName: string;
  readonly atMs: number;
  readonly requestsPerSec: number;
}

/** "Change Lunch rush's rate at 50 s to 200 requests/s". */
export function rateChangeName({
  workloadName,
  atMs,
  requestsPerSec,
}: RateChangeNameInput): string {
  const rate = `${String(requestsPerSec)} requests/s`;
  return `Change ${workloadName}'s rate at ${secondsText(atMs)} to ${rate}`;
}

/** A workload, a point's time, and the time it moves to. */
export interface TimeChangeNameInput {
  readonly workloadName: string;
  readonly atMs: number;
  readonly newAtMs: number;
}

/** "Change Lunch rush's point at 50 s to 55 s". */
export function timeChangeName({
  workloadName,
  atMs,
  newAtMs,
}: TimeChangeNameInput): string {
  const from = secondsText(atMs);
  return `Change ${workloadName}'s point at ${from} to ${secondsText(newAtMs)}`;
}

/** A workload, and the time of the point removed from its profile. */
export interface RemovedPointNameInput {
  readonly workloadName: string;
  readonly atMs: number;
}

/** "Remove the point at 50 s from Lunch rush's profile". */
export function removedPointName({
  workloadName,
  atMs,
}: RemovedPointNameInput): string {
  return `Remove the point at ${secondsText(atMs)} from ${workloadName}'s profile`;
}

/** Where a point went, and how many points there are; rows count from 1. */
export interface MovedMessageInput {
  /** The row the point was in, counting from 0. */
  readonly from: number;
  /** The row it's in now, counting from 0. */
  readonly to: number;
  readonly rowCount: number;
}

/**
 * "Moved to row 4 of 5.", or undefined when the point stayed in its row:
 * there's nothing to tell.
 */
export function movedMessage({
  from,
  to,
  rowCount,
}: MovedMessageInput): string | undefined {
  if (from === to) return undefined;
  return `Moved to row ${String(to + 1)} of ${String(rowCount)}.`;
}

/** What an only point's Remove says. */
export const ONLY_POINT_TEXT = "A profile needs at least one point.";
