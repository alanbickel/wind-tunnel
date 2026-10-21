import type { LimitUse } from "../../../../domain/metrics/metrics-snapshot";
import {
  handleKind,
  type KindHandlers,
} from "../../../../domain/shared/kind-handlers";
import type { RunSoFar } from "../../run-so-far";
import type { Evidence } from "../finding";
import { exhaustedIn, type LimitRef } from "../limit-ref";
import {
  component,
  count,
  listOf,
  plural,
  say,
  type Message,
} from "../message";
import type { FailureCause } from "./failure-causes";

// The limit-refused part of failed-requests (findings.md §2.1): which limit
// refused the failed requests. It writes reasons into failed-requests'
// finding, so it's a helper that detector calls, not a detector.

/** A failure cause that a component rejected, and how it was counted. */
export interface LimitRefusedInput {
  readonly run: RunSoFar;
  readonly cause: FailureCause;
  /**
   * Requests that failed with any rejection by the cause's component, over
   * all its reasons.
   */
  readonly failedAtComponent: number;
}

/** Which limit refused, and what the run says about it. */
export interface LimitRefusal {
  /**
   * The limits that refuse with the cause's reason and ran out in at least
   * one second with these failures. Both, if two did (DynamoDB's buckets).
   */
  readonly limits: readonly LimitUse[];
  readonly reasons: readonly Message[];
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
      ...named.map((e) => exhaustedSentence(e, input)),
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

/** The sentence for a cause that no exhausted limit explains. */
interface UnexplainedInput {
  readonly input: LimitRefusedInput;
  readonly declared: readonly LimitUse[];
}

function unexplained({ input, declared }: UnexplainedInput): Message {
  const { componentId, reason } = input.cause;
  if (declared.length === 0) {
    return say`No limit of ${component(componentId)} refuses with ${reason}, so the run can't say what ran out.`;
  }
  const names = listOf(declared.map((l) => say`${l.name}`));
  return say`${component(componentId)}'s ${names} refuse with ${reason}, but none ran out in a second with these failures.`;
}

/** "in every second with these failures", or in how many of them. */
function coverage(
  { secondsOut }: LimitExhaustion,
  cause: FailureCause,
): Message {
  if (secondsOut === cause.seconds.length) {
    return say`in every second with these failures`;
  }
  return say`in ${count(secondsOut)} of the ${count(cause.seconds.length)} seconds with these failures`;
}

/** The sentence for an exhausted limit, by its kind. */
const EXHAUSTED_SENTENCES: KindHandlers<
  LimitUse,
  (where: Message, componentId: string) => Message
> = {
  concurrency:
    ({ name, limit }) =>
    (where, componentId) =>
      say`${component(componentId)} held all ${count(limit)} of its ${name} ${where}.`,
  rate:
    ({ name, limit }) =>
    (where, componentId) =>
      say`${component(componentId)}'s ${name} bucket, which holds ${count(limit)} tokens, had less than one left ${where}.`,
};

function exhaustedSentence(
  e: LimitExhaustion,
  { cause }: LimitRefusedInput,
): Message {
  return handleKind(EXHAUSTED_SENTENCES, e.limit)(
    coverage(e, cause),
    cause.componentId,
  );
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

/** The attempts sentence and its numbers. */
type AttemptsPart = Pick<LimitRefusal, "reasons" | "evidence">;

/**
 * Refused attempts against failed requests: equal when nothing retried
 * them, more when callers retried, since attempts aren't requests.
 */
function attemptsAndRequests({
  run,
  cause,
  failedAtComponent,
}: LimitRefusedInput): AttemptsPart {
  const { componentId } = cause;
  const rejected = run.snapshots.reduce(
    (n, s) => n + (s.components[componentId]?.rejected ?? 0),
    0,
  );
  const reason =
    rejected === failedAtComponent
      ? say`${component(componentId)} refused ${count(rejected)} ${plural(rejected, ["attempt", "attempts"])}, and each one failed a request.`
      : say`${component(componentId)} refused ${count(rejected)} attempts, but ${count(failedAtComponent)} requests failed with its rejections: callers retried, so attempts aren't requests.`;
  return {
    reasons: [reason],
    evidence: [
      {
        what: `${componentId}: attempts rejected`,
        value: rejected,
        source: "totals",
      },
      {
        what: `${componentId}: requests failed with its rejections`,
        value: failedAtComponent,
        source: "totals",
      },
    ],
  };
}

/**
 * Walks back from the first failure while a named limit stays out: the
 * cause may have begun before the first request failed, for example while
 * retries still got every request through.
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

/** The first index of the unbroken run of seconds out that ends at `from`. */
function firstOfRun({ run, ref, from }: WalkBackInput): number {
  let index = from;
  while (index > 0 && exhaustedIn(run.snapshots[index - 1], ref)) index--;
  return index;
}
