import { lookup } from "../../../../domain/shared/kind-handlers";
import type { TimeWindow } from "../finding";
import {
  at,
  component,
  count,
  duration,
  plural,
  say,
  type Message,
} from "../message";
import type { Phrase, Phrases, Statement } from "../phrase";
import { limitsOf, type Vocabulary } from "../vocabulary";

/**
 * - `emptied`: no message was waiting at the end of the last second;
 * - `waiting`: some were, at the end of a finished run;
 * - `waiting-so-far`: some were, and the run hasn't finished.
 */
export type BacklogState = "emptied" | "waiting" | "waiting-so-far";

/** Messages waited for the queue's consumers. */
export interface MessagesWaitedStatement extends Statement {
  readonly kind: "backlog";
  readonly componentId: string;
  readonly limitName: string;
  readonly state: BacklogState;
  /** From the first second with a backlog to the last. */
  readonly window: TimeWindow;
  /** Messages waiting at the end of the last second. */
  readonly waiting: number;
}

/** What both busy statements say: every consumer was busy. */
interface ConsumersBusy extends Statement {
  readonly componentId: string;
  readonly limitName: string;
  readonly limit: number;
}

/** Every second the limit was out, when none led into the backlog. */
export interface ConsumersBusyStatement extends ConsumersBusy {
  readonly kind: "consumers-busy";
  readonly seconds: number;
}

/** The unbroken run out that led into the first second with a backlog. */
export interface ConsumersBusyRunStatement extends ConsumersBusy {
  readonly kind: "consumers-busy-run";
  readonly window: TimeWindow;
  /** Seconds the limit was out outside that run. */
  readonly otherSeconds: number;
}

/** The backlog's peak, and how fast it grew to it. */
export interface BacklogPeakStatement extends Statement {
  readonly kind: "backlog-peak";
  readonly peak: number;
  /** The end of the first second with the peak. */
  readonly peakEndMs: number;
  /** Where the backlog began. */
  readonly fromMs: number;
  /** Means over the seconds with a backlog, up to the peak's. */
  readonly arrivalsPerSec: number;
  readonly deliveredPerSec: number;
  readonly growthPerSec: number;
}

/** How late deliveries landed in the seconds with a backlog. */
export interface BacklogLatencyStatement extends Statement {
  readonly kind: "backlog-latency";
  /** The slowest delivery: exact. */
  readonly slowestMs: number;
  /** The highest p99 of a second: a bucket's upper bound. */
  readonly highestP99Ms: number;
}

/** How the messages accepted add up, while some are still waiting. */
export interface BacklogAtEndStatement extends Statement {
  readonly kind: "backlog-at-end";
  readonly componentId: string;
  /** Whether the run reached the end of its workload. */
  readonly finished: boolean;
  readonly waiting: number;
  readonly accepted: number;
  readonly delivered: number;
  readonly beingDelivered: number;
}

/** Every statement backlog makes. */
export type BacklogStatement =
  | MessagesWaitedStatement
  | ConsumersBusyStatement
  | ConsumersBusyRunStatement
  | BacklogPeakStatement
  | BacklogLatencyStatement
  | BacklogAtEndStatement;

/** "Messages waited for orders-queue's consumerConcurrency" */
function backedUp(s: MessagesWaitedStatement, v: Vocabulary): Message {
  return say`Messages waited for ${component(s.componentId)}'s ${limitsOf(v, s.componentId)(s.limitName)}`;
}

const SUMMARIES: Readonly<
  Record<BacklogState, Phrase<MessagesWaitedStatement>>
> = {
  emptied: {
    long: (s, v) =>
      say`${backedUp(s, v)} from ${at(s.window.fromMs)}, and its backlog was empty by ${at(s.window.toMs)}.`,
    short: (s, v) =>
      say`messages waited for ${component(s.componentId)}'s ${limitsOf(v, s.componentId)(s.limitName)} from ${at(s.window.fromMs)} to ${at(s.window.toMs)}`,
  },
  waiting: {
    long: (s, v) =>
      say`${backedUp(s, v)} from ${at(s.window.fromMs)}, and ${count(s.waiting)} ${plural(s.waiting, ["was", "were"])} still waiting when the run ended.`,
    short: (s) =>
      say`${count(s.waiting)} ${plural(s.waiting, ["message was", "messages were"])} still waiting in ${component(s.componentId)} when the run ended`,
  },
  "waiting-so-far": {
    long: (s, v) =>
      say`${backedUp(s, v)} from ${at(s.window.fromMs)}, and ${count(s.waiting)} ${plural(s.waiting, ["is", "are"])} still waiting so far.`,
    short: (s) =>
      say`${count(s.waiting)} ${plural(s.waiting, ["message is", "messages are"])} still waiting in ${component(s.componentId)} so far`,
  },
};

/** "All 15 of its consumerConcurrency were busy" */
function allBusy(s: ConsumersBusy, v: Vocabulary): Message {
  return say`All ${count(s.limit)} of its ${limitsOf(v, s.componentId)(s.limitName)} were busy`;
}

/** "all 15 of orders-queue's consumerConcurrency were busy" */
function allBusyShort(s: ConsumersBusy, v: Vocabulary): Message {
  return say`all ${count(s.limit)} of ${component(s.componentId)}'s ${limitsOf(v, s.componentId)(s.limitName)} were busy`;
}

/** "15 seconds", "1 other second" */
function seconds(n: number, other = ""): Message {
  return say`${count(n)} ${other}${plural(n, ["second", "seconds"])}`;
}

/** "It peaked at 1,937 messages in the second ending at 43 s" */
function peaked(s: BacklogPeakStatement): Message {
  return say`It peaked at ${count(s.peak)} ${plural(s.peak, ["message", "messages"])} in the second ending at ${at(s.peakEndMs)}`;
}

/** Whether the run has reached the end of its workload. */
type RunEnd = "finished" | "so-far";

/** The end's statement, with the run finished or not. */
const AT_END: Readonly<Record<RunEnd, Phrase<BacklogAtEndStatement>>> = {
  finished: {
    long: (s) =>
      say`When the run ended, ${count(s.waiting)} ${plural(s.waiting, ["message was", "messages were"])} still waiting: of the ${count(s.accepted)} accepted, ${count(s.delivered)} had been delivered and ${count(s.beingDelivered)} ${plural(s.beingDelivered, ["was", "were"])} being delivered.`,
    short: (s) =>
      say`${count(s.waiting)} of the ${count(s.accepted)} messages ${component(s.componentId)} accepted were still waiting when the run ended`,
  },
  "so-far": {
    long: (s) =>
      say`So far, ${count(s.waiting)} ${plural(s.waiting, ["message is", "messages are"])} waiting: of the ${count(s.accepted)} accepted, ${count(s.delivered)} have been delivered and ${count(s.beingDelivered)} ${plural(s.beingDelivered, ["is", "are"])} being delivered.`,
    short: (s) =>
      say`${count(s.waiting)} of the ${count(s.accepted)} messages ${component(s.componentId)} accepted are waiting so far`,
  },
};

function atEnd(s: BacklogAtEndStatement): Phrase<BacklogAtEndStatement> {
  return lookup(AT_END, s.finished ? "finished" : "so-far");
}

/**
 * How backlog words its statements, at both lengths. A detector that makes
 * them registers it as its `phrases`.
 */
export const BACKLOG_PHRASES: Phrases<BacklogStatement> = {
  backlog: {
    long: (s, v) => lookup(SUMMARIES, s.state).long(s, v),
    short: (s, v) => lookup(SUMMARIES, s.state).short(s, v),
  },
  "consumers-busy": {
    long: (s, v) => say`${allBusy(s, v)} in ${seconds(s.seconds)}.`,
    short: (s, v) => say`${allBusyShort(s, v)} in ${seconds(s.seconds)}`,
  },
  "consumers-busy-run": {
    long: (s, v) => {
      const ledIn = say`${allBusy(s, v)} in every second from ${at(s.window.fromMs)} to ${at(s.window.toMs)}, so messages arriving then waited for one.`;
      if (s.otherSeconds === 0) return ledIn;
      return say`${ledIn} They were also all busy in ${seconds(s.otherSeconds, "other ")}.`;
    },
    short: (s, v) =>
      say`${allBusyShort(s, v)} from ${at(s.window.fromMs)} to ${at(s.window.toMs)}`,
  },
  "backlog-peak": {
    long: (s) => {
      const peak = say`${peaked(s)}. From ${at(s.fromMs)} to then, messages arrived at ${count(s.arrivalsPerSec)} a second and were delivered at ${count(s.deliveredPerSec)}`;
      if (s.growthPerSec <= 0) return say`${peak}.`;
      return say`${peak}, so it grew by about ${count(s.growthPerSec)} a second.`;
    },
    short: (s) =>
      say`the backlog peaked at ${count(s.peak)} ${plural(s.peak, ["message", "messages"])} at ${at(s.peakEndMs)}`,
  },
  "backlog-latency": {
    long: (s) =>
      say`Deliveries in those seconds landed up to ${duration(s.slowestMs)} after their requests; the highest p99 of a second was ${duration(s.highestP99Ms)}.`,
    short: (s) =>
      say`deliveries landed up to ${duration(s.slowestMs)} after their requests`,
  },
  "backlog-at-end": {
    long: (s, v) => atEnd(s).long(s, v),
    short: (s, v) => atEnd(s).short(s, v),
  },
};
