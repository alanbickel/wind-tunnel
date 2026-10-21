import { limitExhausted, type LimitAtPeak } from "../metrics/limit-exhausted";
import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import type {
  ConcurrencyLimitGauge,
  LimitGauge,
  RateLimitGauge,
  WhenFull,
} from "./component-behavior";

/** Slack for the token bucket's floating-point refill (`TOKEN_EPSILON`). */
const TAKEN_TOLERANCE = 1e-3;

/** What the contract remembers about a behavior's limits between reads. */
export interface LimitReading {
  /**
   * Each limit's kind, name, and `whenFull`, in order: the part that must
   * not change.
   */
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
  /** The definition's `rejectionReasons`. */
  readonly rejectionReasons: readonly string[];
}

/** What `checkLimits` found, and what to pass as `previous` next time. */
export interface LimitCheckResult {
  /** One sentence per broken rule; empty if none. */
  readonly problems: string[];
  /** This read, to compare the next one against. */
  readonly reading: LimitReading;
}

/** A `rejected` effect's reason, and the behavior's limits just after it. */
export interface RejectionCheckInput {
  /** The behavior's `limits`, read live. */
  readonly limits: readonly LimitGauge[];
  /** Simulated time of the rejection, for the buckets' levels. */
  readonly nowMs: number;
  readonly reason: string;
  /** The definition's `rejectionReasons`. */
  readonly rejectionReasons: readonly string[];
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
 * - the same limits, by kind, name, and `whenFull`, on every read, with no
 *   name twice;
 * - a limit that makes work wait and holds another names a different limit
 *   of the same component, one that refuses;
 * - a limit that refuses does so with a reason in `rejectionReasons`;
 * - a concurrency limit's use is between 0 and its limit;
 * - a rate limit's values are finite, `taken` never decreases, it never
 *   takes more than its burst plus its rate since the start allows, and its
 *   bucket holds between 0 and `burst` tokens.
 */
export function checkLimits({
  limits,
  nowMs,
  previous,
  rejectionReasons,
}: LimitCheckInput): LimitCheckResult {
  const reading = readLimits(limits);
  const problems = [
    ...changedLimits(previous, reading),
    ...duplicateNames(limits),
    // Later reads must match this one's signature, so once is enough.
    ...(previous === undefined
      ? checkDeclarations(limits, rejectionReasons)
      : []),
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
    signature: limits
      .map(
        (l) =>
          `${l.kind} ${l.name} (${handleKind(WHEN_FULL_TEXT, l.whenFull)})`,
      )
      .join(", "),
    taken: limits.map((l) => handleKind(TAKEN, l)),
  };
}

const WHEN_FULL_TEXT: KindHandlers<WhenFull, string> = {
  refuse: ({ reason }) => `refuses ${reason}`,
  wait: ({ holds }) => `waits holding ${holds ?? "nothing"}`,
};

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

/** Each limit's `whenFull`, against the other limits and the reasons. */
function checkDeclarations(
  limits: readonly LimitGauge[],
  rejectionReasons: readonly string[],
): string[] {
  return [
    ...heldLimits(limits),
    ...limits.flatMap((limit) => checkListed(limit, rejectionReasons)),
  ];
}

/** A refusing limit's reason is one the definition lists. */
function checkListed(
  limit: LimitGauge,
  rejectionReasons: readonly string[],
): string[] {
  const reason = handleKind(REFUSAL_REASON, limit.whenFull);
  if (reason === undefined || rejectionReasons.includes(reason)) return [];
  return [
    `limit ${limit.name} refuses with "${reason}", which rejectionReasons doesn't list.`,
  ];
}

const REFUSAL_REASON: KindHandlers<WhenFull, string | undefined> = {
  refuse: ({ reason }) => reason,
  wait: () => undefined,
};

function heldLimits(limits: readonly LimitGauge[]): string[] {
  return limits.flatMap((limit) => checkHeld(limit, limits));
}

/** The limit that `limit`'s waiting work holds is another one that refuses. */
function checkHeld(limit: LimitGauge, limits: readonly LimitGauge[]): string[] {
  const held = handleKind(HELD, limit.whenFull);
  if (held === undefined) return [];
  const target = limits.find((l) => l.name === held && l !== limit);
  if (target === undefined) {
    return [
      `limit ${limit.name} holds ${held}, which isn't another of its component's limits.`,
    ];
  }
  if (target.whenFull.kind === "refuse") return [];
  return [`limit ${limit.name} holds ${held}, which doesn't refuse work.`];
}

const HELD: KindHandlers<WhenFull, string | undefined> = {
  refuse: () => undefined,
  wait: ({ holds }) => holds,
};

/**
 * The `rejected` rules of `checkComponentContract` (ADR-0016): the
 * effect's reason is in `rejectionReasons`, and if any of the behavior's
 * limits declares it, one of those is full as it rejects, by
 * `limitExhausted`'s rule. The findings rely on that to name the limit
 * behind a failure (ADR-0015). A listed reason that no limit declares has
 * no limit behind it, such as a failed validation.
 */
export function checkRejection({
  limits,
  nowMs,
  reason,
  rejectionReasons,
}: RejectionCheckInput): string[] {
  if (!rejectionReasons.includes(reason)) {
    return [`rejected as "${reason}", which rejectionReasons doesn't list.`];
  }
  const declaring = limits.filter(
    (l) => handleKind(REFUSAL_REASON, l.whenFull) === reason,
  );
  if (declaring.length === 0) return [];
  if (declaring.some((l) => limitExhausted(handleKind(AT_PEAK, l)(nowMs)))) {
    return [];
  }
  const names = declaring.map((l) => l.name).join(", ");
  return [`rejected as "${reason}" while ${names} had room.`];
}

/** A limit's use now, as `limitExhausted` reads it. */
const AT_PEAK: KindHandlers<LimitGauge, (nowMs: number) => LimitAtPeak> = {
  concurrency:
    ({ kind, limit, inUse }) =>
    () => ({ kind, limit, peak: inUse }),
  rate: (gauge) => (nowMs) => ({
    kind: gauge.kind,
    limit: gauge.burst,
    peak: gauge.burst - gauge.tokensLeft(nowMs),
  }),
};

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
