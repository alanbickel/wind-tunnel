import { at, component, count, duration, say } from "../message";
import type { Phrases, Statement } from "../phrase";
import { limitsOf } from "../vocabulary";

/** The bucket drained from full and ran out. */
export interface BucketRanDryStatement extends Statement {
  readonly kind: "bucket-drained";
  readonly componentId: string;
  readonly limitName: string;
  /** Where the drain began: the end of the last second it ended full. */
  readonly drainFromMs: number;
  /** The end of the first second it was out. */
  readonly firstOutEndMs: number;
}

/** The mean flow from when it was last full, against its refill. */
export interface DrainFlowStatement extends Statement {
  readonly kind: "drain-flow";
  readonly fullAtMs: number;
  /** Mean tokens taken a second over the drain. */
  readonly takenPerSec: number;
  readonly ratePerSec: number;
}

/** How long its burst lasted: between the starts and ends of the seconds. */
export interface BurstLastedStatement extends Statement {
  readonly kind: "burst-lasted";
  readonly burst: number;
  readonly atLeastMs: number;
  readonly atMostMs: number;
}

/**
 * How long a full bucket lasts at the drain's flow, by ADR-0014's formula:
 * (burst − 1) ÷ (flow − refill).
 */
export interface BurstPredictedStatement extends Statement {
  readonly kind: "burst-predicted";
  readonly predictedMs: number;
}

/** Every statement bucket-drained makes. */
export type BucketDrainedStatement =
  | BucketRanDryStatement
  | DrainFlowStatement
  | BurstLastedStatement
  | BurstPredictedStatement;

/**
 * How bucket-drained words its statements, at both lengths. A detector that
 * makes them registers it as its `phrases`.
 */
export const BUCKET_DRAINED_PHRASES: Phrases<BucketDrainedStatement> = {
  "bucket-drained": {
    long: (s, v) =>
      say`${component(s.componentId)}'s ${limitsOf(v, s.componentId)(s.limitName)} bucket drained from ${at(s.drainFromMs)} and ran out in the second ending at ${at(s.firstOutEndMs)}.`,
    short: (s, v) =>
      say`${component(s.componentId)}'s ${limitsOf(v, s.componentId)(s.limitName)} bucket drained from ${at(s.drainFromMs)} and ran out by ${at(s.firstOutEndMs)}`,
  },
  "drain-flow": {
    long: (s) => {
      const from = say`It was last full at ${at(s.fullAtMs)}. From then, requests took ${count(s.takenPerSec)} tokens a second on average`;
      const rate = count(s.ratePerSec);
      if (s.takenPerSec <= s.ratePerSec) {
        return say`${from}, no more than its refill of ${rate} a second, but faster than the refill within a second.`;
      }
      return say`${from}, against a refill of ${rate}.`;
    },
    short: (s) =>
      say`requests took ${count(s.takenPerSec)} tokens a second on average, against a refill of ${count(s.ratePerSec)}`,
  },
  "burst-lasted": {
    long: (s) =>
      say`Its burst of ${count(s.burst)} tokens lasted between ${duration(s.atLeastMs)} and ${duration(s.atMostMs)}.`,
    short: (s) =>
      say`its burst of ${count(s.burst)} tokens lasted at most ${duration(s.atMostMs)}`,
  },
  "burst-predicted": {
    long: (s) =>
      say`At that flow, a full bucket lasts about ${duration(s.predictedMs)}: (burst − 1) ÷ (flow − refill).`,
    short: (s) =>
      say`at that flow, a full bucket lasts about ${duration(s.predictedMs)}`,
  },
};
