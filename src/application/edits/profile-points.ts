import type { ProfilePoint } from "../../domain/model/project";

/**
 * How far after the last point "Add point" puts a new one. The editor's own
 * choice, an assumption, not a claim about any system: ten seconds is long
 * enough to see a change of rate on the chart of a minute-long run.
 */
export const NEW_POINT_GAP_MS = 10_000;

/**
 * The profile in time order. A copy: the input is never changed. Points at
 * one time, which only a stored profile can have, keep their order.
 */
export function inTimeOrder(
  profile: readonly ProfilePoint[],
): readonly ProfilePoint[] {
  return [...profile].sort((a, b) => a.atMs - b.atMs);
}

/**
 * Where "Add point" puts a point: `NEW_POINT_GAP_MS` after the latest of
 * these times, or at the start when there are none.
 */
export function nextPointAtMs(timesMs: readonly number[]): number {
  if (timesMs.length === 0) return 0;
  return Math.max(...timesMs) + NEW_POINT_GAP_MS;
}

/** The rows' times, the row of a point, and the time it moves to. */
export interface MovedRowInput {
  /** Every point's time, in the order the rows show them. */
  readonly timesMs: readonly number[];
  /** The point's row now, counting from 0. */
  readonly index: number;
  readonly atMs: number;
}

/**
 * The row, counting from 0, that a point lands in when its time becomes
 * `atMs`: after every other point that's earlier. Only the commands sort,
 * and this says where they will put it, for the screen to announce and to
 * follow with the focus.
 */
export function rowAfterMove({ timesMs, index, atMs }: MovedRowInput): number {
  return timesMs.filter((time, i) => i !== index && time < atMs).length;
}
