import type { MetricsSnapshot } from "../../../../domain/metrics/metrics-snapshot";
import { lookup } from "../../../../domain/shared/kind-handlers";
import { runFinished, type RunSoFar } from "../../run-so-far";
import {
  adviceFor,
  kindAdviceFor,
  mergedAdvice,
  type FindingAdvice,
  type FindingsCatalog,
} from "../catalog/type-advice";
import type { Detector } from "../detector";
import type {
  DetectedFinding,
  Evidence,
  Severity,
  TimeWindow,
} from "../finding";
import { findingKey } from "../finding-key";
import { holdsNothing } from "../limit-ref";
import {
  causeWindowOf,
  refusalOf,
  refusalReasons,
  windowOf,
  type CauseContext,
} from "./cause-parts";
import {
  FAILED_DELIVERIES_PHRASES,
  type FailedDeliveriesStatement,
  type QueueAttemptsStatement,
} from "./failed-deliveries-phrases";
import { isTimeout, runCauses, type FailureCause } from "./failure-causes";

export const FAILED_DELIVERIES = "failed-deliveries";

/**
 * A note for each cause of failed async deliveries (findings.md §2.1), as
 * failed-requests is for failed requests, with queues in place of
 * workflows. Its key is the cause's, so the finding is at the component
 * that refused the work, and limit-refused names the limit. A failed
 * delivery goes back to its queue to be tried again, and its request was
 * already answered, so no request failed: it's a note, or a warning if a
 * delivery failed in the last second of a finished run, when nothing in
 * the run says those messages will ever land.
 *
 * It explains nothing, so it shows at the top level. Its `affected` is
 * undefined: the metrics count attempts, and one message can fail twice.
 */
export function failedDeliveriesDetector(catalog: FindingsCatalog): Detector {
  return {
    id: FAILED_DELIVERIES,
    detect: (run) => {
      const causes = runCauses(run);
      return causes.deliveries.map((cause) =>
        deliveryFinding(cause, { run, causes, catalog }),
      );
    },
    phrases: FAILED_DELIVERIES_PHRASES,
  };
}

/** What every cause's finding reads besides the cause. */
interface DeliveryContext extends CauseContext {
  readonly catalog: FindingsCatalog;
}

function deliveryFinding(
  cause: FailureCause,
  context: DeliveryContext,
): DetectedFinding {
  const { run } = context;
  const { componentId, reason } = cause;
  const refusal = refusalOf(cause, context);
  const limitNames = (refusal?.limits ?? []).map((l) => l.name);
  const window = windowOf(cause, run);
  const queues = queuesOf(cause, run);
  const end = endOf(cause, run);
  return {
    key: findingKey({ kind: FAILED_DELIVERIES, componentId, reason }),
    severity: lookup(SEVERITIES, end),
    limitNames,
    window,
    causeWindow: causeWindowOf({ refusal, window, run }),
    summary: summaryOf(cause, window),
    reasons: [
      ...queues.flatMap(queueStatements),
      ...refusalReasons(cause, refusal),
      lookup(END_STATEMENTS, end)({ cause, run }),
      ...queues.map(waitingAtEnd),
    ],
    evidence: [...causeEvidence(cause), ...queues.flatMap(queueEvidence)],
    ...adviceOf({ cause, limitNames, context }),
    explains: undefined,
    // Attempts aren't messages: one message can fail more than once.
    affected: undefined,
  };
}

/** One queue's deliveries, over the snapshots so far. */
interface QueueDeliveries {
  readonly queueId: string;
  /** Its failed deliveries with this cause. */
  readonly failed: number;
  /** Its deliveries that succeeded (`asyncSucceeded`). */
  readonly delivered: number;
  /** Its failed deliveries, whatever the cause (`asyncFailed`). */
  readonly failedAll: number;
  /** Its consumers' slots held at the end of the last second. */
  readonly beingDelivered: number;
  /** The highest `peakQueueDepth` of a second with this cause's failures. */
  readonly mostWaiting: number;
  /** `queueDepth` at the end of the last second. */
  readonly waitingAtEnd: number;
}

/** A queue whose deliveries failed with a cause. */
interface QueueDeliveriesInput {
  readonly queueId: string;
  readonly cause: FailureCause;
  readonly run: RunSoFar;
}

/** Each queue whose deliveries failed with the cause, in the order first failed. */
function queuesOf(cause: FailureCause, run: RunSoFar): QueueDeliveries[] {
  return [...cause.bySource.keys()].map((queueId) =>
    queueDeliveries({ queueId, cause, run }),
  );
}

function queueDeliveries(input: QueueDeliveriesInput): QueueDeliveries {
  const { queueId, cause, run } = input;
  const last = run.snapshots.at(-1);
  return {
    queueId,
    failed: cause.bySource.get(queueId) ?? 0,
    ...tallyQueue(input),
    beingDelivered: beingDeliveredIn(last, queueId),
    waitingAtEnd: last?.components[queueId]?.queueDepth ?? 0,
  };
}

/** What one pass over the snapshots counts of a queue's deliveries. */
type QueueTally = Pick<
  QueueDeliveries,
  "delivered" | "failedAll" | "mostWaiting"
>;

function tallyQueue({ queueId, cause, run }: QueueDeliveriesInput): QueueTally {
  const tally = { delivered: 0, failedAll: 0, mostWaiting: 0 };
  for (const snapshot of run.snapshots) {
    const metrics = snapshot.components[queueId];
    if (metrics === undefined) continue;
    tally.delivered += metrics.asyncSucceeded;
    tally.failedAll += metrics.asyncFailed;
    if ((metrics.asyncFailures[cause.cause] ?? 0) === 0) continue;
    tally.mostWaiting = Math.max(tally.mostWaiting, metrics.peakQueueDepth);
  }
  return tally;
}

/**
 * Messages a queue's consumers were delivering at the end of the second:
 * the slots held of its limits that make work wait and hold nothing.
 */
function beingDeliveredIn(
  snapshot: MetricsSnapshot | undefined,
  queueId: string,
): number {
  const limits = snapshot?.components[queueId]?.limits ?? [];
  return limits.filter(holdsNothing).reduce((n, l) => n + l.current, 0);
}

function summaryOf(
  cause: FailureCause,
  window: TimeWindow,
): FailedDeliveriesStatement {
  const failed = {
    componentId: cause.componentId,
    failed: cause.failed,
    queueIds: [...cause.bySource.keys()],
    seconds: cause.seconds.length,
    window,
  };
  if (isTimeout(cause)) return { kind: "deliveries-timed-out", ...failed };
  return { kind: "deliveries-refused", reason: cause.reason, ...failed };
}

/**
 * The queue's share of its attempts, which add up, and the backlog a
 * failed delivery went back into.
 */
function queueStatements(q: QueueDeliveries): FailedDeliveriesStatement[] {
  const attempts: QueueAttemptsStatement = {
    kind: "queue-attempts",
    queueId: q.queueId,
    failed: q.failed,
    delivered: q.delivered,
    failedAll: q.failedAll,
    beingDelivered: q.beingDelivered,
  };
  return [
    attempts,
    {
      kind: "failed-delivery-waits",
      queueId: q.queueId,
      mostWaiting: q.mostWaiting,
    },
  ];
}

/**
 * - `stopped`: the last failure came before the last second;
 * - `failing`: one came in the last second of a finished run;
 * - `failing-so-far`: one came in the last second, and the run hasn't
 *   finished.
 */
type DeliveryEnd = "stopped" | "failing" | "failing-so-far";

const SEVERITIES: Readonly<Record<DeliveryEnd, Severity>> = {
  stopped: "note",
  failing: "warning",
  "failing-so-far": "note",
};

function endOf(cause: FailureCause, run: RunSoFar): DeliveryEnd {
  if (cause.seconds.at(-1) !== run.snapshots.length - 1) return "stopped";
  return runFinished(run) ? "failing" : "failing-so-far";
}

/** A cause, and the run it failed in. */
interface EndInput {
  readonly cause: FailureCause;
  readonly run: RunSoFar;
}

const END_STATEMENTS: Readonly<
  Record<DeliveryEnd, (input: EndInput) => FailedDeliveriesStatement>
> = {
  stopped: ({ cause, run }) => {
    const lastFailedMs = run.snapshots[cause.seconds.at(-1) ?? 0]?.endMs ?? 0;
    const quietMs = (run.snapshots.at(-1)?.endMs ?? 0) - lastFailedMs;
    return { kind: "deliveries-stopped-failing", lastFailedMs, quietMs };
  },
  failing: () => ({ kind: "deliveries-still-failing", finished: true }),
  "failing-so-far": () => ({
    kind: "deliveries-still-failing",
    finished: false,
  }),
};

function waitingAtEnd(q: QueueDeliveries): FailedDeliveriesStatement {
  return {
    kind: "queue-waiting-at-end",
    queueId: q.queueId,
    waiting: q.waitingAtEnd,
  };
}

/** A cause, the limits that refused it, and what's read besides. */
interface AdviceInput {
  readonly cause: FailureCause;
  readonly limitNames: readonly string[];
  readonly context: DeliveryContext;
}

/**
 * The queues' advice under this kind of finding, then the refusing
 * limits': what to do about failing deliveries before what ran out.
 */
function adviceOf({ cause, limitNames, context }: AdviceInput): FindingAdvice {
  const { run, catalog } = context;
  const { project } = run;
  return mergedAdvice([
    kindAdviceFor(catalog, {
      project,
      componentIds: [...cause.bySource.keys()],
      kind: FAILED_DELIVERIES,
    }),
    adviceFor(catalog, { project, componentId: cause.componentId, limitNames }),
  ]);
}

function causeEvidence(cause: FailureCause): Evidence[] {
  return [
    {
      what: `${cause.cause}: failed deliveries`,
      value: cause.failed,
      source: "totals",
    },
    {
      what: `${cause.cause}: seconds with a failed delivery`,
      value: cause.seconds.length,
      source: "snapshots",
    },
  ];
}

/** The numbers the queue's statements quote. */
function queueEvidence(q: QueueDeliveries): Evidence[] {
  const read: readonly (readonly [string, number, Evidence["source"]])[] = [
    ["failed deliveries with this cause (asyncFailures)", q.failed, "totals"],
    ["deliveries (asyncSucceeded)", q.delivered, "totals"],
    ["failed deliveries (asyncFailed)", q.failedAll, "totals"],
    [
      "being delivered (consumer slots held at the end of the last second)",
      q.beingDelivered,
      "snapshots",
    ],
    [
      "the highest peakQueueDepth of a second with these failures",
      q.mostWaiting,
      "snapshots",
    ],
    ["queueDepth at the end of the last second", q.waitingAtEnd, "snapshots"],
  ];
  return read.map(([what, value, source]) => ({
    what: `${q.queueId}: ${what}`,
    value,
    source,
  }));
}
