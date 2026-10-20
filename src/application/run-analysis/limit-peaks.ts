import type {
  LimitUse,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-snapshot";
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
  /** Slots for a concurrency limit; tokens per second for a rate limit. */
  readonly limit: number;
  /** The highest use in any second so far, in the limit's unit. */
  readonly peak: number;
  /**
   * `peak / limit`: 1 means the limit was reached. A rate limit can go over
   * 1 by spending saved-up burst tokens. Undefined for a limit of 0.
   */
  readonly peakShare: number | undefined;
}

/** What `limitPeak` needs to find one limit's peak. */
interface LimitPeakContext {
  readonly componentId: string;
  readonly componentLabel: string;
  readonly snapshots: readonly MetricsSnapshot[];
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
    const context = { componentId: id, componentLabel: name, snapshots };
    return limits.map((limit) => limitPeak(limit, context));
  });
}

function limitPeak(limit: LimitUse, context: LimitPeakContext): LimitPeak {
  const { componentId, componentLabel, snapshots } = context;
  const peak = Math.max(
    ...snapshots.map((s) => peakIn({ snapshot: s, componentId, limit })),
  );
  return {
    id: `${componentId} ${limit.name}`,
    componentId,
    componentLabel,
    name: limit.name,
    kind: limit.kind,
    limit: limit.limit,
    peak,
    peakShare: limit.limit === 0 ? undefined : peak / limit.limit,
  };
}

/** Where to look for a limit's peak in one snapshot. */
interface PeakInInput {
  readonly snapshot: MetricsSnapshot;
  readonly componentId: string;
  readonly limit: LimitUse;
}

/** The limit's peak in the snapshot; 0 if the snapshot doesn't have it. */
function peakIn({ snapshot, componentId, limit }: PeakInInput): number {
  const limits = snapshot.components[componentId]?.limits ?? [];
  return limits.find((l) => l.name === limit.name)?.peak ?? 0;
}
