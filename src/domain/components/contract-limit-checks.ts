import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import type {
  ConcurrencyLimitGauge,
  LimitGauge,
  RateLimitGauge,
} from "./component-behavior";

/** Slack for the token bucket's floating-point refill (`TOKEN_EPSILON`). */
const TAKEN_TOLERANCE = 1e-3;

/** What the contract remembers about a behavior's limits between reads. */
export interface LimitReading {
  /** Each limit's kind and name, in order: the part that must not change. */
  readonly signature: string;
  /** Each rate limit's `taken`, by index; 0 for concurrency limits. */
  readonly taken: readonly number[];
}

/** One read of a behavior's limits, and the read before it. */
export interface LimitCheckInput {
  /** The behavior's `limits`, read live. */
  readonly limits: readonly LimitGauge[];
  /** Simulated time of the read, for the buckets' levels. */
  readonly nowMs: number;
  /** The previous read; undefined on the first. */
  readonly previous: LimitReading | undefined;
}

/** What `checkLimits` found, and what to pass as `previous` next time. */
export interface LimitCheckResult {
  /** One sentence per broken rule; empty if none. */
  readonly problems: string[];
  /** This read, to compare the next one against. */
  readonly reading: LimitReading;
}

/** What checking one limit needs besides the limit itself. */
interface GaugeCheckContext {
  readonly nowMs: number;
  /** The limit's `taken` at the previous read, for rate limits. */
  readonly takenBefore: number;
}

/**
 * The `limits` rules of `checkComponentContract`, for one read of a
 * behavior's limits:
 *
 * - the same limits, by kind and name, on every read, with no name twice;
 * - a concurrency limit's use is between 0 and its limit;
 * - a rate limit's values are finite, `taken` never decreases, it never
 *   takes more than its burst plus its rate since the start allows, and its
 *   bucket holds between 0 and `burst` tokens.
 */
export function checkLimits({
  limits,
  nowMs,
  previous,
}: LimitCheckInput): LimitCheckResult {
  const reading = readLimits(limits);
  const problems = [
    ...changedLimits(previous, reading),
    ...duplicateNames(limits),
    ...limits.flatMap((limit, index) =>
      handleKind(
        GAUGE_CHECKS,
        limit,
      )({
        nowMs,
        takenBefore: previous?.taken[index] ?? 0,
      }),
    ),
  ];
  return { problems, reading };
}

function readLimits(limits: readonly LimitGauge[]): LimitReading {
  return {
    signature: limits.map((l) => `${l.kind} ${l.name}`).join(", "),
    taken: limits.map((l) => handleKind(TAKEN, l)),
  };
}

const TAKEN: KindHandlers<LimitGauge, number> = {
  concurrency: () => 0,
  rate: ({ taken }) => taken,
};

function changedLimits(
  previous: LimitReading | undefined,
  reading: LimitReading,
): string[] {
  if (previous === undefined || previous.signature === reading.signature) {
    return [];
  }
  return [
    `limits changed from [${previous.signature}] to [${reading.signature}].`,
  ];
}

function duplicateNames(limits: readonly LimitGauge[]): string[] {
  const names = limits.map((l) => l.name);
  return names
    .filter((name, index) => names.indexOf(name) !== index)
    .map((name) => `limit ${name} appears more than once.`);
}

const GAUGE_CHECKS: KindHandlers<
  LimitGauge,
  (context: GaugeCheckContext) => string[]
> = {
  concurrency: (limit) => () => checkConcurrency(limit),
  rate: (limit) => (context) => checkRate(limit, context),
};

function checkConcurrency({
  name,
  limit,
  inUse,
}: ConcurrencyLimitGauge): string[] {
  if (inUse >= 0 && inUse <= limit) return [];
  return [`limit ${name} has ${String(inUse)} in use out of ${String(limit)}.`];
}

function checkRate(
  limit: RateLimitGauge,
  context: GaugeCheckContext,
): string[] {
  const { name, ratePerSec, burst, taken } = limit;
  if (![ratePerSec, burst, taken].every(Number.isFinite)) {
    return [
      `limit ${name} isn't finite: rate ${String(ratePerSec)}, burst ${String(burst)}, taken ${String(taken)}.`,
    ];
  }
  return [
    ...checkTakenGrows(limit, context),
    ...checkTakenAllowed(limit, context),
    ...checkTokensLeft(limit, context),
  ];
}

function checkTakenGrows(
  { name, taken }: RateLimitGauge,
  { takenBefore }: GaugeCheckContext,
): string[] {
  if (taken >= takenBefore) return [];
  return [
    `limit ${name} taken went from ${String(takenBefore)} to ${String(taken)}.`,
  ];
}

/** A full bucket at the start, refilled at its rate since. */
function checkTakenAllowed(
  { name, ratePerSec, burst, taken }: RateLimitGauge,
  { nowMs }: GaugeCheckContext,
): string[] {
  const allowed = burst + (ratePerSec * nowMs) / 1000;
  if (taken <= allowed + TAKEN_TOLERANCE) return [];
  return [
    `limit ${name} took ${String(taken)} tokens by now; its burst and rate allow ${String(allowed)}.`,
  ];
}

function checkTokensLeft(
  limit: RateLimitGauge,
  { nowMs }: GaugeCheckContext,
): string[] {
  const left = limit.tokensLeft(nowMs);
  if (left >= 0 && left <= limit.burst) return [];
  return [
    `limit ${limit.name} has ${String(left)} tokens left of ${String(limit.burst)}.`,
  ];
}
