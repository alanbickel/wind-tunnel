import { limitExhausted } from "../../../../domain/metrics/limit-exhausted";
import type {
  LimitUse,
  RateLimitUse,
} from "../../../../domain/metrics/metrics-snapshot";
import {
  handleKind,
  type KindHandlers,
} from "../../../../domain/shared/kind-handlers";
import type { RunSoFar } from "../../run-so-far";
import { adviceFor, type FindingsCatalog } from "../catalog/type-advice";
import type { Detector } from "../detector";
import type { DetectedFinding, Evidence, TimeWindow } from "../finding";
import { findingKey } from "../finding-key";
import { limitUseIn, reportedLimits, type LimitRef } from "../limit-ref";
import { at, component, count, duration, say, type Message } from "../message";
import {
  addSecond,
  noSeconds,
  spanOfTally,
  type SecondsTally,
} from "../time-window";

export const BUCKET_DRAINED = "bucket-drained";

/**
 * A cause note for each rate limit that ran out (findings.md §2.1): the
 * bucket ran out because requests took tokens faster than it refills, for
 * long enough to use up its burst. It explains its own limit, so it shows
 * beneath the finding about that limit's refusals.
 *
 * Its `window` is the seconds the bucket was out. Its `causeWindow` starts
 * where the drain began: the end of the last second before the first one
 * out that ended with the bucket full, or the run's start if none did. So
 * the burst and the formula it quotes are about a full bucket.
 */
export function bucketDrainedDetector(catalog: FindingsCatalog): Detector {
  return {
    id: BUCKET_DRAINED,
    detect: (run) =>
      buckets(run).flatMap((bucket) => {
        const tally = tallyBucket(bucket, run);
        const out = spanOfTally(run.snapshots, tally.out);
        const { drain } = tally;
        if (out === undefined || drain === undefined) return [];
        return [drainedFinding({ bucket, tally, drain, out, run, catalog })];
      }),
  };
}

/** A rate limit of a component. */
interface Bucket {
  readonly componentId: string;
  readonly use: RateLimitUse;
}

/** The limit, if it's a bucket: only a rate limit drains. */
const AS_BUCKET: KindHandlers<LimitUse, RateLimitUse | undefined> = {
  concurrency: () => undefined,
  rate: (use) => use,
};

function buckets(run: RunSoFar): Bucket[] {
  return reportedLimits(run).flatMap(({ componentId, use }) => {
    const bucket = handleKind(AS_BUCKET, use);
    return bucket === undefined ? [] : [{ componentId, use: bucket }];
  });
}

/** The drain that led into the first second out, from a full bucket. */
interface Drain {
  /** The index of its first second. */
  readonly start: number;
  readonly seconds: number;
  /** Mean `takenPerSec` over its seconds, the second it ran out included. */
  readonly takenPerSec: number;
}

/** What one pass over the snapshots found about a bucket. */
interface BucketTally {
  /** Seconds in which the bucket ran out. */
  readonly out: SecondsTally;
  /** The first second after the last one that ended with a full bucket. */
  drainStart: number;
  /** Seconds read since `drainStart`, and the tokens taken in them. */
  drainSeconds: number;
  drainTaken: number;
  /** Set at the first second out. */
  drain: Drain | undefined;
}

/** One second of the bucket. */
interface BucketSecond {
  readonly use: RateLimitUse;
  readonly index: number;
  readonly exhausted: boolean;
}

function tallyBucket(bucket: Bucket, run: RunSoFar): BucketTally {
  const tally: BucketTally = {
    out: noSeconds(),
    drainStart: 0,
    drainSeconds: 0,
    drainTaken: 0,
    drain: undefined,
  };
  const ref: LimitRef = {
    componentId: bucket.componentId,
    name: bucket.use.name,
  };
  run.snapshots.forEach((snapshot, index) => {
    const use = limitUseIn(snapshot, ref);
    const bucketUse =
      use === undefined ? undefined : handleKind(AS_BUCKET, use);
    if (bucketUse === undefined) return;
    const second = {
      use: bucketUse,
      index,
      exhausted: limitExhausted(bucketUse),
    };
    if (tally.out.first === undefined) addBeforeOut(tally, second);
    if (second.exhausted) addSecond(tally.out, index);
  });
  return tally;
}

/** Tracks the drain since the bucket was last full, up to the first second out. */
function addBeforeOut(tally: BucketTally, second: BucketSecond): void {
  const { use, index, exhausted } = second;
  tally.drainSeconds++;
  tally.drainTaken += use.takenPerSec;
  if (exhausted) {
    tally.drain = drainOf(tally);
    return;
  }
  // Fewer than one token missing at the second's end: full, so a drain
  // that leads into running out starts after it.
  if (use.current < 1) startDrainAfter(tally, index);
}

function startDrainAfter(tally: BucketTally, index: number): void {
  tally.drainStart = index + 1;
  tally.drainSeconds = 0;
  tally.drainTaken = 0;
}

function drainOf(tally: BucketTally): Drain {
  return {
    start: tally.drainStart,
    seconds: tally.drainSeconds,
    takenPerSec: tally.drainTaken / tally.drainSeconds,
  };
}

/** Everything a note is built from. */
interface DrainedFindingInput {
  readonly bucket: Bucket;
  readonly tally: BucketTally;
  readonly drain: Drain;
  /** From the first second out to the last. */
  readonly out: TimeWindow;
  readonly run: RunSoFar;
  readonly catalog: FindingsCatalog;
}

function drainedFinding(input: DrainedFindingInput): DetectedFinding {
  const { bucket, out, run, catalog } = input;
  const { componentId, use } = bucket;
  return {
    key: findingKey({ kind: BUCKET_DRAINED, componentId, limitName: use.name }),
    severity: "note",
    limitNames: [use.name],
    window: out,
    causeWindow: causeWindowOf(input),
    summary: say`${component(componentId)}'s ${use.name} bucket drained from ${at(drainStartMs(input))} and ran out in the second ending at ${at(firstOutEndMs(input))}.`,
    reasons: [flowSentence(input), ...lastedSentences(input)],
    evidence: evidenceOf(input),
    ...adviceFor(catalog, {
      project: run.project,
      componentId,
      limitNames: [use.name],
    }),
    explains: { componentId, limitName: use.name },
    // A note counts nothing: the failures it explains are counted once.
    affected: undefined,
  };
}

function drainStartMs({ drain, run }: DrainedFindingInput): number {
  return run.snapshots[drain.start]?.startMs ?? 0;
}

function firstOutEndMs({ tally, run }: DrainedFindingInput): number {
  return run.snapshots[tally.out.first ?? 0]?.endMs ?? 0;
}

/** From where the drain began, if that's before the first second out. */
function causeWindowOf(input: DrainedFindingInput): TimeWindow | undefined {
  if (input.drain.start === input.tally.out.first) return undefined;
  return { fromMs: drainStartMs(input), toMs: input.out.toMs };
}

/**
 * When it was last full, where the drain starts (a bucket starts full, so
 * with no full second before, that's the run's start), and the mean flow
 * since. A mean no faster than the refill means the tokens went faster than
 * that within a second.
 */
function flowSentence(input: DrainedFindingInput): Message {
  const { drain, bucket } = input;
  const from = say`It was last full at ${at(drainStartMs(input))}. From then, requests took ${count(drain.takenPerSec)} tokens a second on average`;
  const rate = count(bucket.use.ratePerSec);
  if (drain.takenPerSec <= bucket.use.ratePerSec) {
    return say`${from}, no more than its refill of ${rate} a second, but faster than the refill within a second.`;
  }
  return say`${from}, against a refill of ${rate}.`;
}

/**
 * How long the burst lasted, against ADR-0014's formula: a full bucket
 * lasts (burst − 1) ÷ (flow − refill), since it throttles at less than one
 * token left. A flow no faster than the refill gives no formula.
 */
function lastedSentences(input: DrainedFindingInput): Message[] {
  const { bucket, drain } = input;
  const { limit, ratePerSec } = bucket.use;
  const startMs = drainStartMs(input);
  const lasted = say`Its burst of ${count(limit)} tokens lasted between ${duration(firstOutStartMs(input) - startMs)} and ${duration(firstOutEndMs(input) - startMs)}.`;
  const excessPerSec = drain.takenPerSec - ratePerSec;
  if (excessPerSec <= 0) return [lasted];
  const predictedMs = ((limit - 1) / excessPerSec) * 1_000;
  return [
    lasted,
    say`At that flow, a full bucket lasts about ${duration(predictedMs)}: (burst − 1) ÷ (flow − refill).`,
  ];
}

function firstOutStartMs({ tally, run }: DrainedFindingInput): number {
  return run.snapshots[tally.out.first ?? 0]?.startMs ?? 0;
}

function evidenceOf({ bucket, tally, drain }: DrainedFindingInput): Evidence[] {
  const name = `${bucket.componentId} ${bucket.use.name}`;
  return [
    { what: `${name}: the burst`, value: bucket.use.limit, source: "config" },
    {
      what: `${name}: the refill, per second`,
      value: bucket.use.ratePerSec,
      source: "config",
    },
    {
      what: `${name}: seconds in which it ran out (limitExhausted on the second's peak)`,
      value: tally.out.count,
      source: "snapshots",
    },
    {
      what: `${name}: seconds in the drain (from the last second ending with current < 1, to the first second out)`,
      value: drain.seconds,
      source: "snapshots",
    },
    {
      what: `${name}: mean takenPerSec over the drain`,
      value: drain.takenPerSec,
      source: "snapshots",
    },
  ];
}
