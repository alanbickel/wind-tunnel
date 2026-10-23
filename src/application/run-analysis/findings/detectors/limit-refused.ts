import type { LimitUse } from "../../../../domain/metrics/metrics-snapshot";
import {
  handleKind,
  type KindHandlers,
} from "../../../../domain/shared/kind-handlers";
import type { RunSoFar } from "../../run-so-far";
import type { Evidence } from "../finding";
import { exhaustedIn, type LimitRef } from "../limit-ref";
import type { EndedByRejections, FailureCause } from "./failure-causes";
import type {
  EndedWork,
  LimitRefusedStatement,
  NoLimitRefusesStatement,
  NoRefusingLimitRanOutStatement,
  RefusedAttemptsFailedStatement,
} from "./limit-refused-phrases";

// The limit-refused part of failed-requests and failed-deliveries
// (findings.md §2.1): which limit refused the failed work. It adds reasons
// to those detectors' findings, so it's a helper they call, not a
// detector. Its phrases are in `limit-refused-phrases.ts`.

/** A failure cause that a component rejected, and how it was counted. */
export interface LimitRefusedInput {
  readonly run: RunSoFar;
  readonly cause: FailureCause;
  /**
   * Requests and deliveries that failed with any rejection by the cause's
   * component, over all its reasons.
   */
  readonly endedAtComponent: EndedByRejections;
}

/** Which limit refused, and what the run says about it. */
export interface LimitRefusal {
  /**
   * The limits that refuse with the cause's reason and ran out in at least
   * one second with these failures. Both, if two did (DynamoDB's buckets).
   */
  readonly limits: readonly LimitUse[];
  readonly reasons: readonly LimitRefusedStatement[];
  readonly evidence: readonly Evidence[];
  /**
   * The first snapshot of the unbroken run of seconds in which a named limit
   * was out, leading into the first failure, if that began earlier.
   */
  readonly causeStartIndex: number | undefined;
}

/** A limit that refuses with the cause's reason, and how often it was out. */
interface LimitExhaustion {
  readonly limit: LimitUse;
  /** Seconds with these failures in which the limit ran out. */
  readonly secondsOut: number;
}

/** Names the limit behind a rejection, by the component's declarations. */
export function limitRefused(input: LimitRefusedInput): LimitRefusal {
  const declared = refusingLimits(input);
  const named = declared
    .map((limit) => exhaustion(limit, input))
    .filter((e) => e.secondsOut > 0);
  const attempts = attemptsAndRequests(input);
  if (named.length === 0) {
    const reason = unexplained({ input, declared });
    return {
      ...attempts,
      limits: [],
      reasons: [reason, ...attempts.reasons],
      causeStartIndex: undefined,
    };
  }
  return {
    limits: named.map((e) => e.limit),
    reasons: [
      ...named.map((e) => exhaustedStatement(e, input)),
      ...attempts.reasons,
    ],
    evidence: [
      ...named.flatMap((e) => exhaustionEvidence(e, input)),
      ...attempts.evidence,
    ],
    causeStartIndex: earlierStart(named, input),
  };
}

/** The component's limits that declare they refuse with the cause's reason. */
function refusingLimits({ run, cause }: LimitRefusedInput): LimitUse[] {
  const limits =
    run.snapshots.at(-1)?.components[cause.componentId]?.limits ?? [];
  return limits.filter(
    (l) => l.whenFull.kind === "refuse" && l.whenFull.reason === cause.reason,
  );
}

function exhaustion(
  limit: LimitUse,
  { run, cause }: LimitRefusedInput,
): LimitExhaustion {
  const ref = { componentId: cause.componentId, name: limit.name };
  const secondsOut = cause.seconds.filter((i) =>
    exhaustedIn(run.snapshots[i], ref),
  ).length;
  return { limit, secondsOut };
}

/** The statement for a cause that no exhausted limit explains. */
interface UnexplainedInput {
  readonly input: LimitRefusedInput;
  readonly declared: readonly LimitUse[];
}

function unexplained({
  input,
  declared,
}: UnexplainedInput): NoLimitRefusesStatement | NoRefusingLimitRanOutStatement {
  const { componentId, reason } = input.cause;
  if (declared.length === 0) {
    return { kind: "no-limit-refuses", componentId, reason };
  }
  return {
    kind: "no-refusing-limit-ran-out",
    componentId,
    reason,
    limitNames: declared.map((l) => l.name),
  };
}

/** The statement for an exhausted limit, by its kind. */
const EXHAUSTED_KINDS: KindHandlers<
  LimitUse,
  "limit-held-all" | "bucket-ran-out"
> = {
  concurrency: () => "limit-held-all",
  rate: () => "bucket-ran-out",
};

function exhaustedStatement(
  e: LimitExhaustion,
  { cause }: LimitRefusedInput,
): LimitRefusedStatement {
  return {
    kind: handleKind(EXHAUSTED_KINDS, e.limit),
    componentId: cause.componentId,
    limitName: e.limit.name,
    limit: e.limit.limit,
    coverage: {
      secondsOut: e.secondsOut,
      secondsFailing: cause.seconds.length,
    },
  };
}

function exhaustionEvidence(
  e: LimitExhaustion,
  { cause }: LimitRefusedInput,
): Evidence[] {
  const name = `${cause.componentId} ${e.limit.name}`;
  return [
    { what: `${name}: the limit`, value: e.limit.limit, source: "config" },
    {
      what: `${name}: seconds with these failures in which it ran out (limitExhausted on the second's peak)`,
      value: e.secondsOut,
      source: "snapshots",
    },
  ];
}

/** The attempts statement and its numbers. */
type AttemptsPart = Pick<LimitRefusal, "reasons" | "evidence">;

/**
 * Refused attempts against the requests and deliveries they failed, when
 * they're equal: nothing retried them. When callers retried, the
 * retries-absorbed note compares them, so the comparison appears once.
 */
function attemptsAndRequests({
  run,
  cause,
  endedAtComponent: ended,
}: LimitRefusedInput): AttemptsPart {
  const { componentId } = cause;
  const rejected = rejectedAt(run, componentId);
  if (rejected !== ended.requests + ended.deliveries) {
    return { reasons: [], evidence: [] };
  }
  const statement: RefusedAttemptsFailedStatement = {
    kind: "refused-attempts-failed",
    componentId,
    rejected,
    ended: endedWork(ended),
  };
  return {
    reasons: [statement],
    evidence: attemptsEvidence({ componentId, rejected, ended }),
  };
}

/** The counts the attempts statement compares. */
interface AttemptsEvidenceInput {
  readonly componentId: string;
  readonly rejected: number;
  readonly ended: EndedByRejections;
}

function attemptsEvidence({
  componentId,
  rejected,
  ended,
}: AttemptsEvidenceInput): Evidence[] {
  const counts: readonly (readonly [string, number])[] = [
    ["attempts rejected", rejected],
    ["requests failed with its rejections", ended.requests],
    ["deliveries failed with its rejections", ended.deliveries],
  ];
  return counts.map(([what, value]) => ({
    what: `${componentId}: ${what}`,
    value,
    source: "totals",
  }));
}

function endedWork({ requests, deliveries }: EndedByRejections): EndedWork {
  if (deliveries === 0) return "requests";
  return requests === 0 ? "deliveries" : "both";
}

/** Attempts the component refused so far, retried ones included. */
function rejectedAt(run: RunSoFar, componentId: string): number {
  return run.snapshots.reduce(
    (n, s) => n + (s.components[componentId]?.rejected ?? 0),
    0,
  );
}

/**
 * Walks back from the first failure while a named limit that was out then
 * stays out: the cause may have begun before the first request failed, for
 * example while retries still got every request through.
 */
function earlierStart(
  named: readonly LimitExhaustion[],
  { run, cause }: LimitRefusedInput,
): number | undefined {
  const first = cause.seconds[0] ?? 0;
  const starts = named.map(({ limit }) =>
    firstOfRun({
      run,
      ref: { componentId: cause.componentId, name: limit.name },
      from: first,
    }),
  );
  const start = Math.min(...starts);
  return start < first ? start : undefined;
}

/** Where to walk back from, and which limit to follow. */
interface WalkBackInput {
  readonly run: RunSoFar;
  readonly ref: LimitRef;
  readonly from: number;
}

/**
 * The first index of the unbroken run of seconds out that ends at `from`,
 * or `from` if the limit wasn't out then: a run that ended earlier doesn't
 * lead into the first failure.
 */
function firstOfRun({ run, ref, from }: WalkBackInput): number {
  if (!exhaustedIn(run.snapshots[from], ref)) return from;
  let index = from;
  while (index > 0 && exhaustedIn(run.snapshots[index - 1], ref)) index--;
  return index;
}
