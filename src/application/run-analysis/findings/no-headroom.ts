import type { MetricsSnapshot } from "../../../domain/metrics/metrics-snapshot";
import type { RunSoFar } from "../run-so-far";
import type { TimeWindow } from "./finding";
import { exhaustedIn, reportedLimits, type LimitRef } from "./limit-ref";
import { spanOf } from "./time-window";

/**
 * Limits of one component that refuse when full, ran out, and refused work
 * while they were out, in a run where no request failed: every refusal was
 * retried by a caller or tried again by a queue (findings.md §3.4). They
 * have no headroom left, so the verdict names them instead of quoting
 * their share.
 */
export interface RefusingLimits {
  readonly componentId: string;
  /** In the component's order. Two if both ran out (DynamoDB's buckets). */
  readonly limitNames: readonly string[];
  /** Seconds in which at least one of them was out. */
  readonly secondsOut: number;
  /** From the first of those seconds to the last. */
  readonly window: TimeWindow;
  /**
   * Attempts the component refused in those seconds. `rejected` doesn't
   * split refusals by limit, so one count covers all of `limitNames`.
   */
  readonly rejected: number;
}

/**
 * Each component's refusing limits that ran out in a second in which it
 * refused at least one attempt, in project order. A limit that reached
 * its size but refused nothing isn't here: it keeps the "closest to
 * failing" line, at 100.0%.
 */
export function noHeadroom(run: RunSoFar): RefusingLimits[] {
  const byComponent = new Map<string, LimitRef[]>();
  for (const { componentId, use } of reportedLimits(run)) {
    if (use.whenFull.kind !== "refuse") continue;
    const refs = byComponent.get(componentId) ?? [];
    byComponent.set(componentId, [...refs, { componentId, name: use.name }]);
  }
  return [...byComponent.values()].flatMap((refs) => refusingLimits(run, refs));
}

/** The component's limits that refused, if any, as one entry. */
function refusingLimits(
  run: RunSoFar,
  refs: readonly LimitRef[],
): RefusingLimits[] {
  const refused = refs.filter((ref) => rejectedWhileOut(run, [ref]) > 0);
  const first = refused[0];
  if (first === undefined) return [];
  const seconds = secondsOut(run, refused);
  return [
    {
      componentId: first.componentId,
      limitNames: refused.map((r) => r.name),
      secondsOut: seconds.length,
      window: spanOf({
        snapshots: run.snapshots,
        first: seconds[0] ?? 0,
        last: seconds.at(-1) ?? 0,
      }),
      rejected: rejectedWhileOut(run, refused),
    },
  ];
}

/** Indexes of the seconds in which any of the limits was out. */
function secondsOut(run: RunSoFar, refs: readonly LimitRef[]): number[] {
  return run.snapshots.flatMap((snapshot, index) =>
    anyOut(snapshot, refs) ? [index] : [],
  );
}

function anyOut(snapshot: MetricsSnapshot, refs: readonly LimitRef[]): boolean {
  return refs.some((ref) => exhaustedIn(snapshot, ref));
}

/** Attempts the limits' component refused in the seconds any was out. */
function rejectedWhileOut(run: RunSoFar, refs: readonly LimitRef[]): number {
  const componentId = refs[0]?.componentId ?? "";
  return run.snapshots
    .filter((snapshot) => anyOut(snapshot, refs))
    .reduce((n, s) => n + (s.components[componentId]?.rejected ?? 0), 0);
}
