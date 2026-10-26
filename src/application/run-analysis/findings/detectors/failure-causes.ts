import { TIMEOUT_REASON } from "../../../../domain/engine/simulation-events";
import type { MetricsSnapshot } from "../../../../domain/metrics/metrics-snapshot";
import type { RunSoFar } from "../../run-so-far";

/**
 * One cause of failed work, e.g. `"orders-db: too-many-connections"`, over
 * the snapshots so far: of failed requests, as the workflows' `failures`
 * count them, or of failed deliveries, as the queues' `asyncFailures` do.
 */
export interface FailureCause {
  /** As the snapshots key it: `"<component ID>: <reason>"`. */
  readonly cause: string;
  readonly componentId: string;
  /** The component's rejection reason, or the engine's `"timeout"`. */
  readonly reason: string;
  /** Requests or deliveries that failed with this cause, over every source. */
  readonly failed: number;
  /**
   * Those by source, in the order each first failed: by workflow ID for
   * requests, by queue ID for deliveries.
   */
  readonly bySource: ReadonlyMap<string, number>;
  /** Indexes of the snapshots with at least one such failure, in order. */
  readonly seconds: readonly number[];
  /** The second with the most such failures; the earliest of a tie. */
  readonly worst: WorstSecond;
}

/** The snapshot with the most failures of a cause, and how many. */
export interface WorstSecond {
  readonly index: number;
  readonly failed: number;
}

/** Whether the engine made the failure because a caller stopped waiting. */
export function isTimeout(cause: FailureCause): boolean {
  return cause.reason === TIMEOUT_REASON;
}

/**
 * The causes at the component that are its own rejections; timeouts at the
 * component don't count.
 */
export function rejectionCauses(
  causes: readonly FailureCause[],
  componentId: string,
): FailureCause[] {
  return causes.filter((c) => c.componentId === componentId && !isTimeout(c));
}

/** Requests or deliveries that failed because the component rejected them, over all its reasons. */
export function failedWithRejections(
  causes: readonly FailureCause[],
  componentId: string,
): number {
  return rejectionCauses(causes, componentId).reduce((n, c) => n + c.failed, 0);
}

/** Every cause of failed requests and of failed deliveries so far. */
export interface RunCauses {
  readonly requests: readonly FailureCause[];
  readonly deliveries: readonly FailureCause[];
}

/** Work that a component's rejections ended, with no retry left. */
export interface EndedByRejections {
  readonly requests: number;
  readonly deliveries: number;
}

/** The requests and deliveries that failed with the component's rejections. */
export function endedByRejections(
  causes: RunCauses,
  componentId: string,
): EndedByRejections {
  return {
    requests: failedWithRejections(causes.requests, componentId),
    deliveries: failedWithRejections(causes.deliveries, componentId),
  };
}

/** Both kinds of cause, each read in one pass over the snapshots. */
export function runCauses(run: RunSoFar): RunCauses {
  return { requests: failureCauses(run), deliveries: deliveryCauses(run) };
}

/**
 * Every cause of failed requests so far, in the order each first failed,
 * read in one pass over the snapshots.
 */
export function failureCauses(run: RunSoFar): FailureCause[] {
  return tallyCauses(run, (snapshot) =>
    Object.entries(snapshot.workflows).map(([id, w]) => [id, w.failures]),
  );
}

/**
 * Every cause of failed async deliveries so far, by the queue whose
 * delivery failed, in the order each first failed (ADR-0017).
 */
export function deliveryCauses(run: RunSoFar): FailureCause[] {
  return tallyCauses(run, (snapshot) =>
    Object.entries(snapshot.components).map(([id, c]) => [id, c.asyncFailures]),
  );
}

/** A snapshot's failures by cause, keyed by the source that counted them. */
type FailuresBySource = (
  snapshot: MetricsSnapshot,
) => [string, Readonly<Record<string, number>>][];

function tallyCauses(
  run: RunSoFar,
  failuresOf: FailuresBySource,
): FailureCause[] {
  const componentIds = run.project.architecture.components.map((c) => c.id);
  const tallies = new Map<string, CauseTally>();
  run.snapshots.forEach((snapshot, index) => {
    for (const [sourceId, failures] of failuresOf(snapshot)) {
      for (const [cause, failed] of Object.entries(failures)) {
        const tally = tallies.get(cause) ?? startTally(cause, componentIds);
        tallies.set(cause, tally);
        addFailures(tally, { index, sourceId, failed });
      }
    }
  });
  return [...tallies.values()].map(finishTally);
}

/** A cause's counts while the snapshots are read. */
interface CauseTally {
  readonly cause: string;
  readonly componentId: string;
  readonly reason: string;
  failed: number;
  readonly bySource: Map<string, number>;
  readonly seconds: number[];
  worst: WorstSecond;
  /** Failures so far in the latest second in `seconds`. */
  secondFailed: number;
}

/** One source's failures with a cause in one second. */
interface FailuresInSecond {
  readonly index: number;
  readonly sourceId: string;
  readonly failed: number;
}

function startTally(
  cause: string,
  componentIds: readonly string[],
): CauseTally {
  return {
    cause,
    ...splitCause(cause, componentIds),
    failed: 0,
    bySource: new Map(),
    seconds: [],
    worst: { index: 0, failed: 0 },
    secondFailed: 0,
  };
}

function addFailures(tally: CauseTally, add: FailuresInSecond): void {
  const { index, sourceId, failed } = add;
  if (failed <= 0) return;
  tally.failed += failed;
  tally.bySource.set(sourceId, (tally.bySource.get(sourceId) ?? 0) + failed);
  if (tally.seconds.at(-1) !== index) {
    tally.seconds.push(index);
    tally.secondFailed = 0;
  }
  tally.secondFailed += failed;
  if (tally.secondFailed > tally.worst.failed) {
    tally.worst = { index, failed: tally.secondFailed };
  }
}

function finishTally(tally: CauseTally): FailureCause {
  const { cause, componentId, reason, failed, bySource, seconds, worst } =
    tally;
  return { cause, componentId, reason, failed, bySource, seconds, worst };
}

/** A cause's component and reason. */
export type CauseParts = Pick<FailureCause, "componentId" | "reason">;

/**
 * Splits `"<component ID>: <reason>"` (the metrics' `workflow-tally`
 * format). Matching the project's component IDs, longest first, keeps an ID
 * that itself holds ": " whole.
 */
export function splitCause(
  cause: string,
  componentIds: readonly string[],
): CauseParts {
  const matches = componentIds.filter((id) => cause.startsWith(`${id}: `));
  const longest = matches.sort((a, b) => b.length - a.length)[0];
  const componentId =
    longest ?? cause.slice(0, Math.max(0, cause.indexOf(": ")));
  return { componentId, reason: cause.slice(componentId.length + 2) };
}
