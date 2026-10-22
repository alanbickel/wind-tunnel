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
