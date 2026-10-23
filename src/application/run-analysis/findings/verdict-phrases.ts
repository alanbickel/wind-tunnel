import type { LimitUse } from "../../../domain/metrics/metrics-snapshot";
import { lookup } from "../../../domain/shared/kind-handlers";
import type { LimitPeak } from "../limit-peaks";
import type { WorkflowTotals } from "../run-totals";
import type { Headroom, WarmUp } from "./headroom";
import { amountOf } from "./limit-ref";
import {
  at,
  component,
  count,
  joinMessages,
  listOf,
  plural,
  say,
  share,
  type Message,
} from "./message";
import type { RefusingLimits } from "./no-headroom";
import type { VerdictLevel } from "./verdict";
import type { Phrase, Phrases, Statement } from "./phrase";
import { limitsOf, type Vocabulary } from "./vocabulary";

/** The verdict's request counts, by its level. */
export interface VerdictSummaryStatement extends Statement {
  readonly kind: "verdict-summary";
  readonly level: VerdictLevel;
  /** Whether the run reached the end of its workload. */
  readonly finished: boolean;
  /** Over every workflow: started = succeeded + failed + inProgress. */
  readonly requests: WorkflowTotals;
  /** Findings that are warnings. */
  readonly warnings: number;
  /**
   * The first warning in the findings' order (findings.md §3.3), which a
   * degraded verdict names; undefined when no finding is a warning.
   */
  readonly topWarning: Statement | undefined;
}

/** The refusing limits that ran out and refused work, though none failed. */
export interface NoHeadroomStatement extends Statement {
  readonly kind: "no-headroom";
  /** One per component, in project order. */
  readonly refusing: readonly RefusingLimits[];
}

/** The limit closest to refusing work, with its peak. */
export interface ClosestToFailingStatement extends Statement {
  readonly kind: "closest-to-failing";
  readonly headroom: Headroom;
}

/** Every statement the verdict makes. */
export type VerdictStatement =
  VerdictSummaryStatement | NoHeadroomStatement | ClosestToFailingStatement;

/**
 * The summary's statement, with the requests answered and the words for
 * the top warning.
 */
interface Answered {
  readonly statement: VerdictSummaryStatement;
  readonly answered: number;
  readonly vocabulary: Vocabulary;
}

/** The request counts by level, without the requests in progress. */
const COUNTS: Readonly<Record<VerdictLevel, (a: Answered) => Message>> = {
  failing: ({ statement: { requests }, answered }) =>
    say`${count(requests.failed)} of ${count(answered)} answered requests failed (${share(requests.failed / answered)})`,
  degraded: ({ statement, answered, vocabulary }) => {
    const { topWarning, warnings } = statement;
    if (topWarning === undefined) return allSucceeded(answered);
    return say`${allSucceeded(answered)}, but ${vocabulary.quote(topWarning)}${moreWarnings(warnings - 1)}`;
  },
  healthy: ({ answered }) => allSucceeded(answered),
};

/** ", and 2 more warnings", after the warning the verdict names. */
function moreWarnings(n: number): Message {
  if (n <= 0) return [];
  return say`, and ${count(n)} more ${plural(n, ["warning", "warnings"])}`;
}

function allSucceeded(answered: number): Message {
  return say`All ${count(answered)} answered ${plural(answered, ["request", "requests"])} succeeded`;
}

/** The counts in the short form, which leaves out the warnings. */
const SHORT_COUNTS: Readonly<Record<VerdictLevel, (a: Answered) => Message>> = {
  failing: ({ statement: { requests }, answered }) =>
    say`${count(requests.failed)} of ${count(answered)} answered requests failed`,
  degraded: ({ answered }) => allSucceededShort(answered),
  healthy: ({ answered }) => allSucceededShort(answered),
};

function allSucceededShort(answered: number): Message {
  return say`all ${count(answered)} answered ${plural(answered, ["request", "requests"])} succeeded`;
}

function answeredOf({ requests }: VerdictSummaryStatement): number {
  return requests.succeeded + requests.failed;
}

function noneAnswered({ finished }: VerdictSummaryStatement): Message {
  return finished
    ? say`No request was answered`
    : say`No request has been answered yet`;
}

/** Requests in progress, which never raise the level (findings.md §3.2). */
function inProgressClause({
  finished,
  requests,
}: VerdictSummaryStatement): Message {
  const n = requests.inProgress;
  if (n === 0) return [];
  if (finished) {
    return say`; ${count(n)} ${plural(n, ["was", "were"])} still in progress when the run ended`;
  }
  return say`; ${count(n)} ${plural(n, ["is", "are"])} in progress`;
}

const SUMMARY: Phrase<VerdictSummaryStatement> = {
  long: (s, vocabulary) => {
    const answered = answeredOf(s);
    const counts =
      answered === 0
        ? noneAnswered(s)
        : lookup(COUNTS, s.level)({ statement: s, answered, vocabulary });
    return say`${counts}${inProgressClause(s)}.`;
  },
  short: (s, vocabulary) => {
    const answered = answeredOf(s);
    if (answered === 0) return say`no request has been answered`;
    return lookup(
      SHORT_COUNTS,
      s.level,
    )({ statement: s, answered, vocabulary });
  },
};

/** "orders-db connections", or "table readUnits and writeUnits" */
function limitNamesOf(limits: RefusingLimits, v: Vocabulary): Message {
  const { componentId, limitNames } = limits;
  const limit = limitsOf(v, componentId);
  const names = listOf(limitNames.map((name) => say`${limit(name)}`));
  return say`${component(componentId)} ${names}`;
}

/** "refused 90 attempts" */
function refused({ rejected }: RefusingLimits): Message {
  return say`refused ${count(rejected)} ${plural(rejected, ["attempt", "attempts"])}`;
}

/**
 * "orders-db connections ran out in 39 seconds from 14 s to 54 s, and
 * orders-db refused 90 attempts"
 */
function ranOutClause(limits: RefusingLimits, v: Vocabulary): Message {
  const { componentId, secondsOut, window } = limits;
  return say`${limitNamesOf(limits, v)} ran out in ${count(secondsOut)} ${plural(secondsOut, ["second", "seconds"])} from ${at(window.fromMs)} to ${at(window.toMs)}, and ${component(componentId)} ${refused(limits)}`;
}

/**
 * "No headroom: orders-db connections ran out in 39 seconds from 14 s to
 * 54 s, and orders-db refused 90 attempts; no request failed with its
 * rejections." One clause per component.
 */
const NO_HEADROOM: Phrase<NoHeadroomStatement> = {
  long: ({ refusing }, v) => {
    const clauses = refusing.map((limits) => ranOutClause(limits, v));
    const whose = plural(refusing.length, ["its", "their"]);
    return say`No headroom: ${joinMessages(clauses, "; ")}; no request failed with ${whose} rejections.`;
  },
  short: ({ refusing }, v) =>
    joinMessages(
      refusing.map(
        (limits) =>
          say`${limitNamesOf(limits, v)} ran out and ${refused(limits)}`,
      ),
      "; ",
    ),
};

/** "fn-api concurrency" */
function limitNameOf(limit: LimitPeak, v: Vocabulary): Message {
  const name = limitsOf(v, limit.componentId)(limit.name);
  return say`${component(limit.componentId)} ${name}`;
}

/** "at most 13 of 90 (14.4%)", with the unit for a rate limit. */
function atMost(limit: LimitPeak, peak: number): Message {
  return say`at most ${amountOf(limit, peak)} (${share(peak / limit.limit)})`;
}

function warmUpClause(limit: LimitPeak, warmUp: WarmUp): Message {
  const cold = [...warmUp.coldStarts].map(
    ([id, n]) =>
      say`${component(id)} had ${count(n)} ${plural(n, ["cold start", "cold starts"])}`,
  );
  const during = say`from ${at(warmUp.window.fromMs)} to ${at(warmUp.window.toMs)}, while ${listOf(cold)}`;
  if (warmUp.warmPeak === undefined) return during;
  return say`${during}; ${atMost(limit, warmUp.warmPeak)} in the seconds without cold starts`;
}

/**
 * A bucket's busiest second against its refill rate, as labeled context:
 * its level is the number, since that's what refuses (ADR-0014).
 */
const FLOW_CLAUSES: Readonly<
  Record<LimitUse["kind"], (limit: LimitPeak) => Message>
> = {
  concurrency: () => [],
  rate: ({ flow }) =>
    flow === undefined
      ? []
      : say`; its busiest second took ${count(flow.busiestTakenPerSec)} tokens, against a refill of ${count(flow.ratePerSec)} a second`,
};

const CLOSEST_TO_FAILING: Phrase<ClosestToFailingStatement> = {
  long: ({ headroom: { limit, warmUp } }, v) => {
    const name = limitNameOf(limit, v);
    const atPeak = atMost(limit, limit.peak);
    const flow = lookup(FLOW_CLAUSES, limit.kind)(limit);
    if (warmUp === undefined) {
      return say`Closest to failing: ${name}, ${atPeak}${flow}.`;
    }
    return say`Closest to failing: ${name}, ${atPeak} ${warmUpClause(limit, warmUp)}${flow}.`;
  },
  short: ({ headroom: { limit } }, v) =>
    say`${limitNameOf(limit, v)} peaked at ${amountOf(limit, limit.peak)} (${share(limit.peak / limit.limit)})`,
};

/**
 * How the verdict words its statements, at both lengths. `createPhrasebook`
 * always registers them.
 */
export const VERDICT_PHRASES: Phrases<VerdictStatement> = {
  "verdict-summary": SUMMARY,
  "no-headroom": NO_HEADROOM,
  "closest-to-failing": CLOSEST_TO_FAILING,
};
