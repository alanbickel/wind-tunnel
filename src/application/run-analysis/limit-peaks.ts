import { limitExhausted } from "../../domain/metrics/limit-exhausted";
import type {
  LimitUse,
  MetricsSnapshot,
  RateLimitUse,
} from "../../domain/metrics/metrics-snapshot";
import {
  handleKind,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import type { RunSoFar } from "./run-so-far";

/** One of a component's limits, and the most of it used so far. */
export interface LimitPeak {
  /** The component ID and the limit's name, e.g. `orders-db connections`. */
  readonly id: string;
  readonly componentId: string;
  /** The component's name. */
  readonly componentLabel: string;
  /** The limit's name, e.g. `connections`. */
  readonly name: string;
  readonly kind: LimitUse["kind"];
  /** Slots for a concurrency limit; the bucket's size for a rate limit. */
  readonly limit: number;
  /**
   * The most used at once so far, in the limit's unit: slots held, or
   * tokens drawn out of a full bucket.
   */
  readonly peak: number;
  /** `peak / limit`, from 0 to 1. Undefined for a limit of 0. */
  readonly peakShare: number | undefined;
  /**
   * Whether the limit ran out at its peak, so a request arriving then waited
   * or was rejected. A bucket can run out short of a `peakShare` of 1; see
   * `limitExhausted`.
   */
  readonly exhausted: boolean;
  /** A rate limit's flow; undefined for a concurrency limit. */
  readonly flow: RateFlow | undefined;
}

/**
 * How fast a rate limit's bucket refills and empties. Taking tokens faster
 * than `ratePerSec` drains the bucket; slower, and it refills.
 */
export interface RateFlow {
  readonly ratePerSec: number;
  /** The busiest second's tokens taken so far. */
  readonly busiestTakenPerSec: number;
}

/** What `limitPeak` needs to find one limit's peak. */
interface LimitPeakContext {
  readonly componentId: string;
  readonly componentLabel: string;
  /** The limit's use in each snapshot that reports it. */
  readonly uses: readonly LimitUse[];
}

/**
 * Every component's limits, in architecture order, each with its highest
 * use in any second so far. A limit appears once a snapshot reports it, so
 * the list is empty before the first snapshot.
 */
export function limitPeaks({ project, snapshots }: RunSoFar): LimitPeak[] {
  const latest = snapshots.at(-1);
  return project.architecture.components.flatMap(({ id, name }) => {
    const limits = latest?.components[id]?.limits ?? [];
    return limits.map((limit) =>
      limitPeak(limit, {
        componentId: id,
        componentLabel: name,
        uses: usesOf({ snapshots, componentId: id, name: limit.name }),
      }),
    );
  });
}

function limitPeak(limit: LimitUse, context: LimitPeakContext): LimitPeak {
  const { componentId, componentLabel, uses } = context;
  const peak = Math.max(...uses.map((use) => use.peak));
  return {
    id: `${componentId} ${limit.name}`,
    componentId,
    componentLabel,
    name: limit.name,
    kind: limit.kind,
    limit: limit.limit,
    peak,
    peakShare: limit.limit === 0 ? undefined : peak / limit.limit,
    exhausted: limitExhausted({ kind: limit.kind, limit: limit.limit, peak }),
    flow: handleKind(FLOWS, limit)(uses),
  };
}

/** A rate limit's flow, given its use in each snapshot. */
const FLOWS: KindHandlers<
  LimitUse,
  (uses: readonly LimitUse[]) => RateFlow | undefined
> = {
  concurrency: () => () => undefined,
  rate: (limit) => (uses) => rateFlow(limit, uses),
};

/** The busiest second's flow, against the limit's rate. */
function rateFlow(limit: RateLimitUse, uses: readonly LimitUse[]): RateFlow {
  return {
    ratePerSec: limit.ratePerSec,
    busiestTakenPerSec: Math.max(...uses.map((use) => handleKind(TAKEN, use))),
  };
}

/** Tokens taken per second; a concurrency limit takes none. */
const TAKEN: KindHandlers<LimitUse, number> = {
  concurrency: () => 0,
  rate: ({ takenPerSec }) => takenPerSec,
};

/** Where to look for one limit across the snapshots. */
interface UsesOfInput {
  readonly snapshots: readonly MetricsSnapshot[];
  readonly componentId: string;
  readonly name: string;
}

/** The limit's use in each snapshot that reports it. */
function usesOf({ snapshots, componentId, name }: UsesOfInput): LimitUse[] {
  return snapshots.flatMap((snapshot) => {
    const limits = snapshot.components[componentId]?.limits ?? [];
    return limits.filter((limit) => limit.name === name);
  });
}
