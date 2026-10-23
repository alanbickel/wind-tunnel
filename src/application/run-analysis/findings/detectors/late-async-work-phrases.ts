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
} from "../message";
import type { Phrases, Statement } from "../phrase";

/** The entry edge whose timeout the late work is compared with. */
export interface WaitLimit {
  /** The caller, which stops waiting after `timeoutMs`. */
  readonly from: string;
  readonly to: string;
  readonly timeoutMs: number;
}

/** Work queued in the queue finished past the entry edge's timeout. */
export interface WorkFinishedLateStatement extends Statement {
  readonly kind: "late-async-work";
  readonly queueId: string;
  /** The slowest delivery of the run so far, from its request. */
  readonly slowestMs: number;
  readonly wait: WaitLimit;
}

/** The seconds whose p99 delivery was over the timeout. */
export interface LateSecondsStatement extends Statement {
  readonly kind: "late-seconds";
  readonly over: number;
  readonly window: TimeWindow;
  readonly timeoutMs: number;
  readonly highestP99Ms: number;
}

/** Some of those seconds were within the histogram's error. */
export interface LateNearTimeoutStatement extends Statement {
  readonly kind: "late-near-timeout";
  readonly near: number;
  readonly timeoutMs: number;
  /** The histogram's error, as a share: `PERCENTILE_ERROR`. */
  readonly percentileError: number;
}

/** The workflows' answers stayed quick, since a request ends once queued. */
export interface AnsweredQuicklyStatement extends Statement {
  readonly kind: "answered-quickly";
  /** Each workflow's highest p99 of the late seconds, in project order. */
  readonly answered: readonly WorkflowP99[];
}

/** A workflow's highest answered p99. */
export interface WorkflowP99 {
  readonly workflowId: string;
  readonly p99Ms: number;
}

/** No synchronous design could have waited that long. */
export interface NoSynchronousWaitStatement extends Statement {
  readonly kind: "no-synchronous-wait";
  readonly wait: WaitLimit;
}

/** Every statement late-async-work makes. */
export type LateAsyncWorkStatement =
  | WorkFinishedLateStatement
  | LateSecondsStatement
  | LateNearTimeoutStatement
  | AnsweredQuicklyStatement
  | NoSynchronousWaitStatement;

/**
 * How late-async-work words its statements, at both lengths. A detector that
 * makes them registers it as its `phrases`.
 */
export const LATE_ASYNC_WORK_PHRASES: Phrases<LateAsyncWorkStatement> = {
  "late-async-work": {
    long: ({ queueId, slowestMs, wait }) =>
      say`Work queued in ${component(queueId)} finished up to ${duration(slowestMs)} after its request, past the ${duration(wait.timeoutMs)} that ${component(wait.from)} waits for ${component(wait.to)}.`,
    short: ({ queueId, wait }) =>
      say`work queued in ${component(queueId)} finished past the ${duration(wait.timeoutMs)} ${component(wait.from)} waits for ${component(wait.to)}`,
  },
  "late-seconds": {
    long: (s) =>
      say`In ${count(s.over)} ${plural(s.over, ["second", "seconds"])} from ${at(s.window.fromMs)} to ${at(s.window.toMs)}, the p99 of the deliveries that ended in the second was over ${duration(s.timeoutMs)}, and as high as ${duration(s.highestP99Ms)}.`,
    short: (s) =>
      say`the p99 of deliveries was over ${duration(s.timeoutMs)} in ${count(s.over)} ${plural(s.over, ["second", "seconds"])}`,
  },
  "late-near-timeout": {
    long: (s) =>
      say`In ${count(s.near)} of those seconds, the p99 was within the histogram's ${share(s.percentileError)} error of ${duration(s.timeoutMs)}, so it may have been under it.`,
    short: (s) =>
      say`in ${count(s.near)} of those seconds, the p99 may have been under ${duration(s.timeoutMs)}`,
  },
  "answered-quickly": {
    long: (s, v) => {
      const answered = s.answered.map(
        (w) => say`${v.workflow(w.workflowId)} within ${duration(w.p99Ms)}`,
      );
      return say`Meanwhile, users were answered quickly, because a request ends once its work is queued: ${listOf(answered)} (the highest p99 of those seconds).`;
    },
    short: () =>
      say`users were answered quickly, because a request ends once its work is queued`,
  },
  "no-synchronous-wait": {
    long: ({ wait }) =>
      say`No synchronous design could have offered that wait: ${component(wait.from)} stops waiting for ${component(wait.to)} after ${duration(wait.timeoutMs)}.`,
    short: ({ wait }) =>
      say`${component(wait.from)} stops waiting for ${component(wait.to)} after ${duration(wait.timeoutMs)}`,
  },
};
