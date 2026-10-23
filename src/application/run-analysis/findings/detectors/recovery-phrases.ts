import type { LimitSize } from "../limit-ref";
import { amountOf } from "../limit-ref";
import { at, component, duration, say } from "../message";
import type { Phrases, Statement } from "../phrase";

// What the recovery part of failed-requests says: whether the failures
// stopped before the run did, and how much of each limit was used after.

/** The failures stopped before the run's last second. */
export interface FailuresStoppedStatement extends Statement {
  readonly kind: "failures-stopped";
  /** The end of the last second with a failure. */
  readonly lastFailedMs: number;
  /** From then to the end of the last second. */
  readonly quietMs: number;
}

/** A refusing limit's highest peak in the seconds after the last failure. */
export interface LimitPeakedAfterStatement extends Statement {
  readonly kind: "limit-peaked-after";
  readonly componentId: string;
  readonly limitName: string;
  readonly limit: LimitSize;
  readonly peak: number;
}

/** Requests failed with the cause in the last second so far. */
export interface RequestsStillFailingStatement extends Statement {
  readonly kind: "requests-still-failing";
  /** Whether the run reached the end of its workload. */
  readonly finished: boolean;
}

/** Every statement recovery makes. */
export type RecoveryStatement =
  | FailuresStoppedStatement
  | LimitPeakedAfterStatement
  | RequestsStillFailingStatement;

/**
 * How recovery words its statements, at both lengths. A detector that makes
 * them registers it as its `phrases`.
 */
export const RECOVERY_PHRASES: Phrases<RecoveryStatement> = {
  "failures-stopped": {
    long: (s) =>
      say`The last failure was in the second ending at ${at(s.lastFailedMs)}, and none followed in the ${duration(s.quietMs)} after it.`,
    short: (s) =>
      say`the last failure was at ${at(s.lastFailedMs)}, with none in the ${duration(s.quietMs)} after it`,
  },
  "limit-peaked-after": {
    long: (s, v) =>
      say`After it, ${component(s.componentId)}'s ${v.limit({ componentId: s.componentId, id: s.limitName })} peaked at ${amountOf(s.limit, s.peak)}.`,
    short: (s, v) =>
      say`after the last failure, ${component(s.componentId)}'s ${v.limit({ componentId: s.componentId, id: s.limitName })} peaked at ${amountOf(s.limit, s.peak)}`,
  },
  "requests-still-failing": {
    long: ({ finished }) =>
      finished
        ? say`Requests were still failing with it when the run ended.`
        : say`Requests are still failing with it.`,
    short: ({ finished }) =>
      finished
        ? say`requests were still failing with it when the run ended`
        : say`requests are still failing with it`,
  },
};
