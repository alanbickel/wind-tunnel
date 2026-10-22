import type { MetricsSnapshot } from "../../../domain/metrics/metrics-snapshot";
import type { TimeWindow } from "./finding";

/** The snapshots to span, by index, first to last. */
export interface SpanInput {
  readonly snapshots: readonly MetricsSnapshot[];
  readonly first: number;
  readonly last: number;
}

/** From the start of the first snapshot to the end of the last. */
export function spanOf({ snapshots, first, last }: SpanInput): TimeWindow {
  return {
    fromMs: snapshots[first]?.startMs ?? 0,
    toMs: snapshots[last]?.endMs ?? 0,
  };
}

/** The seconds in which something held, as snapshot indexes read in order. */
export interface SecondsTally {
  /** The first such index, or undefined if none has been read. */
  first: number | undefined;
  /** The last index read; 0 until one is. */
  last: number;
  /** How many indexes were read. */
  count: number;
}

/** A tally with no seconds read. */
export function noSeconds(): SecondsTally {
  return { first: undefined, last: 0, count: 0 };
}

/** Adds the snapshot at `index`, which must come after any added before. */
export function addSecond(tally: SecondsTally, index: number): void {
  tally.first ??= index;
  tally.last = index;
  tally.count++;
}

/** The seconds read, as snapshots to span; undefined if there were none. */
export function spanOfTally(
  snapshots: readonly MetricsSnapshot[],
  tally: SecondsTally,
): TimeWindow | undefined {
  if (tally.first === undefined) return undefined;
  return spanOf({ snapshots, first: tally.first, last: tally.last });
}
