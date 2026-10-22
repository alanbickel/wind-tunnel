import type { MetricsSnapshot } from "../../../domain/metrics/metrics-snapshot";
import { limitPeaks, type LimitPeak } from "../limit-peaks";
import type { RunSoFar } from "../run-so-far";
import type { TimeWindow } from "./finding";
import { limitUseIn } from "./limit-ref";
import { spanOf } from "./time-window";

/**
 * The limit closest to refusing work: among the limits that refuse when
 * full, the one with the highest `peak / limit` (findings.md §3.4). Limits
 * that make work wait aren't headroom: waiting is what they're for.
 */
export interface Headroom {
  readonly limit: LimitPeak;
  /** Set when the peak came only while cold starts were warming up. */
  readonly warmUp: WarmUp | undefined;
}

/**
 * The peak came only in seconds when the limit's component, or one that
 * calls it, had cold starts. The peak is still the one reported, never
 * hidden; this is its context.
 */
export interface WarmUp {
  /** From the first second at the peak to the last. */
  readonly window: TimeWindow;
  /** Cold starts in the seconds at the peak, by component, in call order. */
  readonly coldStarts: ReadonlyMap<string, number>;
  /** The highest peak in the seconds without cold starts, if there were any. */
  readonly warmPeak: number | undefined;
}

/**
 * The counter that components which start cold report, such as Lambda's.
 * Read by name, so no detector needs to know which types have one.
 */
export const COLD_STARTS = "coldStarts";

/** The limit closest to refusing work, or undefined if none has reported. */
export function headroom(run: RunSoFar): Headroom | undefined {
  const limit = closestToRefusing(limitPeaks(run));
  if (limit === undefined) return undefined;
  return { limit, warmUp: warmUpOf(run, limit) };
}

/** The highest share among the limits that refuse; the first of a tie. */
function closestToRefusing(peaks: readonly LimitPeak[]): LimitPeak | undefined {
  return peaks
    .filter((p) => p.whenFull.kind === "refuse" && p.peakShare !== undefined)
    .reduce<LimitPeak | undefined>(
      (best, p) => ((p.peakShare ?? 0) > (best?.peakShare ?? -1) ? p : best),
      undefined,
    );
}

/** The seconds read so far, split by whether a warmer cold-started. */
interface WarmUpTally {
  readonly peakSeconds: number[];
  readonly coldStarts: Map<string, number>;
  warmPeak: number | undefined;
  /** Whether the peak came in a second without cold starts. */
  peakWhileWarm: boolean;
}

function warmUpOf(run: RunSoFar, limit: LimitPeak): WarmUp | undefined {
  const warmers = warmersOf(run, limit.componentId);
  const tally: WarmUpTally = {
    peakSeconds: [],
    coldStarts: new Map(),
    warmPeak: undefined,
    peakWhileWarm: false,
  };
  run.snapshots.forEach((snapshot, index) => {
    addSecond(tally, { snapshot, index, limit, warmers });
  });
  if (tally.peakWhileWarm || tally.peakSeconds.length === 0) return undefined;
  const window = spanOf({
    snapshots: run.snapshots,
    first: tally.peakSeconds[0] ?? 0,
    last: tally.peakSeconds.at(-1) ?? 0,
  });
  return { window, coldStarts: tally.coldStarts, warmPeak: tally.warmPeak };
}

/**
 * The limit's component and the components that call it: one hop up
 * `architecture.edges`, the only call-graph reasoning findings use
 * (findings.md §2.3).
 */
function warmersOf(run: RunSoFar, componentId: string): string[] {
  const callers = run.project.architecture.edges
    .filter((e) => e.to === componentId)
    .map((e) => e.from);
  return [...new Set([...callers, componentId])];
}

/** One second, with the limit and the components whose cold starts count. */
interface WarmUpSecond {
  readonly snapshot: MetricsSnapshot;
  readonly index: number;
  readonly limit: LimitPeak;
  readonly warmers: readonly string[];
}

function addSecond(tally: WarmUpTally, second: WarmUpSecond): void {
  const { snapshot, index, limit, warmers } = second;
  const peak = limitUseIn(snapshot, limit)?.peak ?? 0;
  const cold = coldStartsIn(snapshot, warmers);
  if (cold.length === 0) {
    tally.warmPeak = Math.max(tally.warmPeak ?? 0, peak);
    tally.peakWhileWarm ||= peak >= limit.peak;
    return;
  }
  if (peak < limit.peak) return;
  tally.peakSeconds.push(index);
  addColdStarts(tally, cold);
}

function addColdStarts(
  tally: WarmUpTally,
  cold: readonly [string, number][],
): void {
  for (const [id, n] of cold) {
    tally.coldStarts.set(id, (tally.coldStarts.get(id) ?? 0) + n);
  }
}

/** Each warmer's cold starts in the second, leaving out those with none. */
function coldStartsIn(
  snapshot: MetricsSnapshot,
  warmers: readonly string[],
): [string, number][] {
  return warmers.flatMap((id): [string, number][] => {
    const n = snapshot.components[id]?.counters[COLD_STARTS] ?? 0;
    return n > 0 ? [[id, n]] : [];
  });
}
