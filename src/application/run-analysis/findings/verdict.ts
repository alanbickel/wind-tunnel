import type { LimitUse } from "../../../domain/metrics/metrics-snapshot";
import { lookup } from "../../../domain/shared/kind-handlers";
import type { LimitPeak } from "../limit-peaks";
import {
  allWorkflows,
  workflowTotals,
  type WorkflowTotals,
} from "../run-totals";
import { runFinished, type RunSoFar } from "../run-so-far";
import type { Finding, Severity } from "./finding";
import { headroom, type Headroom, type WarmUp } from "./headroom";
import { amountOf, type LimitRef } from "./limit-ref";
import { noHeadroom, type RefusingLimits } from "./no-headroom";
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

/**
 * What a run comes to, healthy runs included (findings.md §3.4). Always
 * present, before the findings.
 */
export interface Verdict {
  readonly level: VerdictLevel;
  /** Whether the run reached the end of its workload; if not, "so far". */
  readonly finished: boolean;
  /** The level in words, e.g. "Failing" or "Healthy so far". */
  readonly title: string;
  /** Over every workflow: started = succeeded + failed + inProgress. */
  readonly requests: WorkflowTotals;
  /** The request counts in a sentence. */
  readonly summary: Message;
  /**
   * The refusing limits that ran out and refused work, though no request
   * failed: retried by callers or tried again by queues. Empty for a
   * failing run, whose failure findings name its limits.
   */
  readonly noHeadroom: readonly RefusingLimits[];
  /** `noHeadroom` in a sentence, if it has any. */
  readonly noHeadroomLine: Message | undefined;
  /**
   * The limit closest to refusing work, among those not in `noHeadroom`.
   * Undefined for a failing run: a limit already refused, and the failure
   * findings name it.
   */
  readonly headroom: Headroom | undefined;
  /** `headroom` in a sentence. */
  readonly headroomLine: Message | undefined;
}

/**
 * - `failing`: some finding is a failure;
 * - `degraded`: none is, but some finding is a warning;
 * - `healthy`: neither.
 */
export type VerdictLevel = "failing" | "degraded" | "healthy";

/** The verdict for the run and every finding the detectors returned. */
export function verdictOf(
  run: RunSoFar,
  findings: readonly Finding[],
): Verdict {
  const level = levelOf(findings);
  const finished = runFinished(run);
  const requests = allWorkflows(workflowTotals(run));
  const refusing = level === "failing" ? [] : noHeadroom(run);
  const room =
    level === "failing" ? undefined : headroom(run, refsOf(refusing));
  return {
    level,
    finished,
    title: `${lookup(TITLES, level)}${finished ? "" : " so far"}`,
    requests,
    summary: summaryOf({ level, finished, requests, findings }),
    noHeadroom: refusing,
    noHeadroomLine:
      refusing.length === 0 ? undefined : noHeadroomLine(refusing),
    headroom: room,
    headroomLine: room === undefined ? undefined : headroomLine(room),
  };
}

const TITLES: Readonly<Record<VerdictLevel, string>> = {
  failing: "Failing",
  degraded: "Degraded",
  healthy: "Healthy",
};

/** The level a finding's severity sets, from the most severe down. */
const LEVELS: readonly (readonly [Severity, VerdictLevel])[] = [
  ["failure", "failing"],
  ["warning", "degraded"],
];

function levelOf(findings: readonly Finding[]): VerdictLevel {
  const severities = new Set(findings.map((f) => f.severity));
  return (
    LEVELS.find(([severity]) => severities.has(severity))?.[1] ?? "healthy"
  );
}

/** What the summary sentence is built from. */
interface SummaryInput {
  readonly level: VerdictLevel;
  readonly finished: boolean;
  readonly requests: WorkflowTotals;
  readonly findings: readonly Finding[];
}

function summaryOf(input: SummaryInput): Message {
  const answered = input.requests.succeeded + input.requests.failed;
  const counts =
    answered === 0
      ? noneAnswered(input)
      : lookup(SUMMARIES, input.level)({ ...input, answered });
  return say`${counts}${inProgressClause(input)}.`;
}

function noneAnswered({ finished }: SummaryInput): Message {
  return finished
    ? say`No request was answered`
    : say`No request has been answered yet`;
}

/** The summary's input, with the requests answered. */
interface AnsweredInput extends SummaryInput {
  readonly answered: number;
}

const SUMMARIES: Readonly<
  Record<VerdictLevel, (input: AnsweredInput) => Message>
> = {
  failing: ({ requests, answered }) =>
    say`${count(requests.failed)} of ${count(answered)} answered requests failed (${share(requests.failed / answered)})`,
  degraded: ({ answered, findings }) => {
    const warnings = findings.filter((f) => f.severity === "warning").length;
    return say`${allSucceeded(answered)}, but ${count(warnings)} ${plural(warnings, ["finding is a warning", "findings are warnings"])}`;
  },
  healthy: ({ answered }) => allSucceeded(answered),
};

function allSucceeded(answered: number): Message {
  return say`All ${count(answered)} answered ${plural(answered, ["request", "requests"])} succeeded`;
}

/** Requests in progress, which never raise the level (findings.md §3.2). */
function inProgressClause({ finished, requests }: SummaryInput): Message {
  const n = requests.inProgress;
  if (n === 0) return [];
  if (finished) {
    return say`; ${count(n)} ${plural(n, ["was", "were"])} still in progress when the run ended`;
  }
  return say`; ${count(n)} ${plural(n, ["is", "are"])} in progress`;
}

function refsOf(refusing: readonly RefusingLimits[]): LimitRef[] {
  return refusing.flatMap(({ componentId, limitNames }) =>
    limitNames.map((name) => ({ componentId, name })),
  );
}

/**
 * "No headroom: orders-db connections ran out in 39 seconds from 14 s to
 * 54 s, and orders-db refused 90 attempts; no request failed with its
 * rejections." One clause per component.
 */
function noHeadroomLine(refusing: readonly RefusingLimits[]): Message {
  const clauses = refusing.map(ranOutClause);
  const whose = plural(refusing.length, ["its", "their"]);
  return say`No headroom: ${joinMessages(clauses, "; ")}; no request failed with ${whose} rejections.`;
}

function ranOutClause(limits: RefusingLimits): Message {
  const { componentId, limitNames, secondsOut, window, rejected } = limits;
  const names = listOf(limitNames.map((name) => say`${name}`));
  return say`${component(componentId)} ${names} ran out in ${count(secondsOut)} ${plural(secondsOut, ["second", "seconds"])} from ${at(window.fromMs)} to ${at(window.toMs)}, and ${component(componentId)} refused ${count(rejected)} ${plural(rejected, ["attempt", "attempts"])}`;
}

function headroomLine({ limit, warmUp }: Headroom): Message {
  const name = say`${component(limit.componentId)} ${limit.name}`;
  const atPeak = atMost(limit, limit.peak);
  const flow = lookup(FLOW_CLAUSES, limit.kind)(limit);
  if (warmUp === undefined) {
    return say`Closest to failing: ${name}, ${atPeak}${flow}.`;
  }
  return say`Closest to failing: ${name}, ${atPeak} ${warmUpClause(limit, warmUp)}${flow}.`;
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
