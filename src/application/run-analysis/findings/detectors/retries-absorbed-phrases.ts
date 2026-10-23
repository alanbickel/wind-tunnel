import { lookup } from "../../../../domain/shared/kind-handlers";
import type { TimeWindow } from "../finding";
import {
  at,
  component,
  count,
  duration,
  listOf,
  plural,
  say,
  type Message,
  type PluralForms,
} from "../message";
import type { Phrases, Statement, Vocabulary } from "../phrase";

/** A component refused more attempts than failed work with its rejections. */
export interface RetriedRefusalsStatement extends Statement {
  readonly kind: "retries-absorbed";
  readonly componentId: string;
  /** Attempts refused, retried ones included. */
  readonly rejected: number;
  /** Requests that failed with its rejections. */
  readonly failedRequests: number;
  /** Deliveries that failed with its rejections. */
  readonly failedDeliveries: number;
}

/** The seconds in which it refused attempts. */
export interface RefusingSecondsStatement extends Statement {
  readonly kind: "refusing-seconds";
  readonly componentId: string;
  readonly seconds: number;
  readonly window: TimeWindow;
}

/** A refused attempt isn't a request: one request can be refused twice. */
export interface AttemptsAreNotRequestsStatement extends Statement {
  readonly kind: "attempts-are-not-requests";
}

/** The reasons it refuses with, which say what the counts are of. */
export interface RefusalReasonsStatement extends Statement {
  readonly kind: "refusal-reasons";
  readonly componentId: string;
  /** Those its limits declare, then any other its failures carry. */
  readonly reasons: readonly string[];
}

/** A workflow's p99 while the component refused, against before. */
export interface LatencyWhileRefusingStatement extends Statement {
  readonly kind: "latency-while-refusing";
  readonly componentId: string;
  readonly workflowId: string;
  /** The median second's p99 while it refused. */
  readonly medianMs: number;
  /** The highest second's p99 while it refused. */
  readonly highestMs: number;
  /** The median second's p99 before it refused, if any second came before. */
  readonly beforeMs: number | undefined;
}

/** Every statement retries-absorbed makes. */
export type RetriesAbsorbedStatement =
  | RetriedRefusalsStatement
  | RefusingSecondsStatement
  | AttemptsAreNotRequestsStatement
  | RefusalReasonsStatement
  | LatencyWhileRefusingStatement;

/** "orders-db refused 17 attempts" */
function refused(s: RetriedRefusalsStatement): Message {
  return say`${component(s.componentId)} refused ${count(s.rejected)} ${plural(s.rejected, ["attempt", "attempts"])}`;
}

/** "4,377 requests", "90 deliveries", or both; none if neither failed. */
function failedParts(s: RetriedRefusalsStatement): Message[] {
  const parts: readonly (readonly [number, PluralForms])[] = [
    [s.failedRequests, ["request", "requests"]],
    [s.failedDeliveries, ["delivery", "deliveries"]],
  ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, forms]) => say`${count(n)} ${plural(n, forms)}`);
}

/** How many reasons the component refuses with, for the statement. */
type ReasonCount = "none" | "one" | "several";

function reasonCount(n: number): ReasonCount {
  if (n === 0) return "none";
  return n === 1 ? "one" : "several";
}

/** A reasons statement's reasons, as the component's type words them. */
function reasonsOf(s: RefusalReasonsStatement, v: Vocabulary): string[] {
  return s.reasons.map((id) => v.reason({ componentId: s.componentId, id }));
}

/** Words a reasons statement by how many reasons it has. */
type ReasonsWording = (
  s: RefusalReasonsStatement,
  reasons: readonly string[],
) => Message;

const REASONS_LONG: Readonly<Record<ReasonCount, ReasonsWording>> = {
  none: () =>
    say`None of its limits declares a rejection reason, and no request failed with one, so the run can't say why it refused.`,
  one: (_, [reason = ""]) =>
    say`It refuses only with ${reason}, so the attempts and the requests are both ${reason} rejections.`,
  several: (_, reasons) =>
    say`It refuses with ${listOf(reasons.map((r) => say`${r}`))}, and refused attempts aren't counted by reason, so the run can't say how many of each were retried.`,
};

const REASONS_SHORT: Readonly<Record<ReasonCount, ReasonsWording>> = {
  none: (s) => say`the run can't say why ${component(s.componentId)} refused`,
  one: (s, [reason = ""]) =>
    say`${component(s.componentId)} refuses only with ${reason}`,
  several: (s, reasons) =>
    say`${component(s.componentId)} refuses with ${listOf(reasons.map((r) => say`${r}`))}, which refused attempts don't count apart`,
};

/**
 * "While it refused attempts, Get order's p99 was 41 ms in the median
 * second, and up to 1.2 s"
 */
function whileRefusing(
  s: LatencyWhileRefusingStatement,
  v: Vocabulary,
): Message {
  return say`While it refused attempts, ${v.workflow(s.workflowId)}'s p99 was ${duration(s.medianMs)} in the median second, and up to ${duration(s.highestMs)}`;
}

/**
 * How retries-absorbed words its statements, at both lengths. A detector
 * that makes them registers it as its `phrases`.
 */
export const RETRIES_ABSORBED_PHRASES: Phrases<RetriesAbsorbedStatement> = {
  "retries-absorbed": {
    long: (s) => {
      const failed = failedParts(s);
      if (failed.length === 0) {
        return say`${refused(s)}, but no request failed with its rejections: callers retried every one.`;
      }
      return say`${refused(s)}, but only ${listOf(failed)} failed with its rejections: callers retried the rest.`;
    },
    short: (s) => {
      const failed = failedParts(s);
      if (failed.length === 0)
        return say`${refused(s)}, and callers retried every one`;
      return say`${refused(s)}, and only ${listOf(failed)} failed with them`;
    },
  },
  "refusing-seconds": {
    long: (s) =>
      say`It refused attempts in ${count(s.seconds)} ${plural(s.seconds, ["second", "seconds"])} from ${at(s.window.fromMs)} to ${at(s.window.toMs)}.`,
    short: (s) =>
      say`${component(s.componentId)} refused attempts in ${count(s.seconds)} ${plural(s.seconds, ["second", "seconds"])}`,
  },
  "attempts-are-not-requests": {
    long: () =>
      say`Attempts aren't requests: a request refused twice and then served counts as two refused attempts, so the difference isn't how many requests the retries saved.`,
    short: () =>
      say`the difference isn't how many requests the retries saved, since attempts aren't requests`,
  },
  "refusal-reasons": {
    long: (s, v) => {
      const reasons = reasonsOf(s, v);
      return lookup(REASONS_LONG, reasonCount(reasons.length))(s, reasons);
    },
    short: (s, v) => {
      const reasons = reasonsOf(s, v);
      return lookup(REASONS_SHORT, reasonCount(reasons.length))(s, reasons);
    },
  },
  "latency-while-refusing": {
    long: (s, v) => {
      if (s.beforeMs === undefined) return say`${whileRefusing(s, v)}.`;
      return say`${whileRefusing(s, v)}, against ${duration(s.beforeMs)} in the median second before.`;
    },
    short: (s, v) =>
      say`${v.workflow(s.workflowId)}'s p99 was ${duration(s.medianMs)} in the median second while ${component(s.componentId)} refused attempts`,
  },
};
