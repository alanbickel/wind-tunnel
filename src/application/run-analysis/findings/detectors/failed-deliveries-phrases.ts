import type { TimeWindow } from "../finding";
import {
  at,
  component,
  count,
  duration,
  listOf,
  plural,
  say,
  share,
  type Message,
} from "../message";
import type { Phrases, Statement } from "../phrase";
import { CAUSE_PHRASES, type CauseStatement } from "./cause-parts-phrases";

/** What both summaries quote about a cause's failed deliveries. */
interface DeliveriesFailed extends Statement {
  readonly componentId: string;
  readonly failed: number;
  /** The queues whose deliveries failed, in the order each first failed. */
  readonly queueIds: readonly string[];
  /** Seconds with a failed delivery. */
  readonly seconds: number;
  readonly window: TimeWindow;
}

/** A component refused queues' deliveries, which went back to be retried. */
export interface DeliveriesRefusedStatement extends DeliveriesFailed {
  readonly kind: "deliveries-refused";
  readonly reason: string;
}

/** Queues' deliveries failed because a component didn't answer in time. */
export interface DeliveriesTimedOutStatement extends DeliveriesFailed {
  readonly kind: "deliveries-timed-out";
}

/**
 * A queue's failed deliveries with the cause against its delivery
 * attempts, which add up: delivered + failed + being delivered.
 */
export interface QueueAttemptsStatement extends Statement {
  readonly kind: "queue-attempts";
  readonly queueId: string;
  /** Its failed deliveries with this cause. */
  readonly failed: number;
  readonly delivered: number;
  /** Its failed deliveries, whatever the cause. */
  readonly failedAll: number;
  readonly beingDelivered: number;
}

/** A failed delivery went back into the queue's backlog. */
export interface FailedDeliveryWaitsStatement extends Statement {
  readonly kind: "failed-delivery-waits";
  readonly queueId: string;
  /** The highest `peakQueueDepth` of a second with one of the failures. */
  readonly mostWaiting: number;
}

/** The last failure came before the last second. */
export interface DeliveriesStoppedFailingStatement extends Statement {
  readonly kind: "deliveries-stopped-failing";
  /** The end of the last second with a failure. */
  readonly lastFailedMs: number;
  /** From then to the end of the last second. */
  readonly quietMs: number;
}

/** A delivery failed with the cause in the last second so far. */
export interface DeliveriesStillFailingStatement extends Statement {
  readonly kind: "deliveries-still-failing";
  /** Whether the run reached the end of its workload. */
  readonly finished: boolean;
}

/** Messages waiting in the queue at the end of the last second. */
export interface QueueWaitingAtEndStatement extends Statement {
  readonly kind: "queue-waiting-at-end";
  readonly queueId: string;
  readonly waiting: number;
}

/** Every statement failed-deliveries makes. */
export type FailedDeliveriesStatement =
  | DeliveriesRefusedStatement
  | DeliveriesTimedOutStatement
  | QueueAttemptsStatement
  | FailedDeliveryWaitsStatement
  | DeliveriesStoppedFailingStatement
  | DeliveriesStillFailingStatement
  | QueueWaitingAtEndStatement
  | CauseStatement;

/** "90 deliveries from orders-queue" */
function deliveries(s: DeliveriesFailed): Message {
  const queues = listOf(s.queueIds.map((id) => say`${component(id)}`));
  return say`${count(s.failed)} ${plural(s.failed, ["delivery", "deliveries"])} from ${queues}`;
}

/** "in 33 seconds from 16 s to 53 s" */
function when(s: DeliveriesFailed): Message {
  return say`in ${count(s.seconds)} ${plural(s.seconds, ["second", "seconds"])} from ${at(s.window.fromMs)} to ${at(s.window.toMs)}`;
}

/** "and each went back to be tried again" */
function back(s: DeliveriesFailed): Message {
  return say`and ${plural(s.failed, ["it", "each"])} went back to be tried again`;
}

function attemptsOf(s: QueueAttemptsStatement): number {
  return s.delivered + s.failedAll + s.beingDelivered;
}

/** "That's 90 of orders-queue's 13,191 delivery attempts (0.6%)" */
function shareOfAttempts(s: QueueAttemptsStatement): Message {
  const attempts = attemptsOf(s);
  return say`${count(s.failed)} of ${component(s.queueId)}'s ${count(attempts)} delivery attempts (${share(s.failed / attempts)})`;
}

/**
 * How failed-deliveries words its statements, at both lengths. A detector
 * that makes them registers it as its `phrases`.
 */
export const FAILED_DELIVERIES_PHRASES: Phrases<FailedDeliveriesStatement> = {
  ...CAUSE_PHRASES,
  "deliveries-refused": {
    long: (s, v) =>
      say`${component(s.componentId)} refused ${deliveries(s)} with ${v.reason({ componentId: s.componentId, id: s.reason })} ${when(s)}, ${back(s)}.`,
    short: (s, v) =>
      say`${component(s.componentId)} refused ${deliveries(s)} with ${v.reason({ componentId: s.componentId, id: s.reason })}`,
  },
  "deliveries-timed-out": {
    long: (s) =>
      say`${deliveries(s)} failed because ${component(s.componentId)} didn't answer in time, ${when(s)}, ${back(s)}.`,
    short: (s) =>
      say`${deliveries(s)} failed because ${component(s.componentId)} didn't answer in time`,
  },
  "queue-attempts": {
    long: (s) =>
      say`That's ${shareOfAttempts(s)}. Of those, ${count(s.delivered)} were delivered, ${count(s.failedAll)} failed, and ${count(s.beingDelivered)} ${plural(s.beingDelivered, ["was", "were"])} still being delivered.`,
    short: (s) => say`that's ${shareOfAttempts(s)}`,
  },
  "failed-delivery-waits": {
    long: (s) =>
      say`A failed delivery waits in the backlog again: ${component(s.queueId)} had up to ${count(s.mostWaiting)} ${plural(s.mostWaiting, ["message", "messages"])} waiting in a second with one of these failures.`,
    short: (s) =>
      say`a failed delivery waits in ${component(s.queueId)}'s backlog again`,
  },
  "deliveries-stopped-failing": {
    long: (s) =>
      say`The last failed in the second ending at ${at(s.lastFailedMs)}, and none failed in the ${duration(s.quietMs)} after it.`,
    short: (s) =>
      say`the last failed at ${at(s.lastFailedMs)}, with none in the ${duration(s.quietMs)} after it`,
  },
  "deliveries-still-failing": {
    long: ({ finished }) =>
      finished
        ? say`Deliveries were still failing with it in the run's last second, so nothing in the run says those messages will land.`
        : say`Deliveries are still failing with it.`,
    short: ({ finished }) =>
      finished
        ? say`deliveries were still failing with it in the run's last second`
        : say`deliveries are still failing with it`,
  },
  "queue-waiting-at-end": {
    long: (s) =>
      say`At the end of the last second, ${component(s.queueId)} had ${s.waiting === 0 ? "no" : count(s.waiting)} ${plural(s.waiting, ["message", "messages"])} waiting.`,
    short: (s) =>
      say`${component(s.queueId)} had ${s.waiting === 0 ? "no" : count(s.waiting)} ${plural(s.waiting, ["message", "messages"])} waiting at the end`,
  },
};
