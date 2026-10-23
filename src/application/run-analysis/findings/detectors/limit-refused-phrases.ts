import { lookup } from "../../../../domain/shared/kind-handlers";
import {
  component,
  count,
  listOf,
  plural,
  say,
  type Message,
  type PluralForms,
} from "../message";
import type { Phrases, Statement } from "../phrase";
import type { Vocabulary } from "../vocabulary";

// What limit-refused says about a failure cause: which limit refused it,
// or that none explains it, and whether every refused attempt failed.

/** No limit of the component declares that it refuses with the reason. */
export interface NoLimitRefusesStatement extends Statement {
  readonly kind: "no-limit-refuses";
  readonly componentId: string;
  readonly reason: string;
}

/** Some limits refuse with the reason, but none ran out while it failed. */
export interface NoRefusingLimitRanOutStatement extends Statement {
  readonly kind: "no-refusing-limit-ran-out";
  readonly componentId: string;
  readonly reason: string;
  /** The limits that declare the reason, in the component's order. */
  readonly limitNames: readonly string[];
}

/** A concurrency limit held all its slots in seconds with the failures. */
export interface LimitHeldAllStatement extends Statement {
  readonly kind: "limit-held-all";
  readonly componentId: string;
  readonly limitName: string;
  readonly limit: number;
  readonly coverage: Coverage;
}

/** A bucket had less than one token left in seconds with the failures. */
export interface BucketRanOutStatement extends Statement {
  readonly kind: "bucket-ran-out";
  readonly componentId: string;
  readonly limitName: string;
  /** The burst: the most tokens it holds. */
  readonly limit: number;
  readonly coverage: Coverage;
}

/** How many of the seconds with the failures a limit was out in. */
export interface Coverage {
  readonly secondsOut: number;
  readonly secondsFailing: number;
}

/** Every attempt the component refused failed work: nothing retried it. */
export interface RefusedAttemptsFailedStatement extends Statement {
  readonly kind: "refused-attempts-failed";
  readonly componentId: string;
  readonly rejected: number;
  readonly ended: EndedWork;
}

/** Which kinds of work the rejections ended. */
export type EndedWork = "requests" | "deliveries" | "both";

/** Every statement limit-refused makes. */
export type LimitRefusedStatement =
  | NoLimitRefusesStatement
  | NoRefusingLimitRanOutStatement
  | LimitHeldAllStatement
  | BucketRanOutStatement
  | RefusedAttemptsFailedStatement;

const ENDED_WORK: Readonly<Record<EndedWork, string>> = {
  requests: "a request",
  deliveries: "a delivery",
  both: "a request or a delivery",
};

/** "in every second with these failures", or in how many of them. */
function where({ secondsOut, secondsFailing }: Coverage): Message {
  if (secondsOut === secondsFailing) {
    return say`in every second with these failures`;
  }
  return say`in ${count(secondsOut)} of the ${count(secondsFailing)} seconds with these failures`;
}

/** The limit's name, as its component's type words it. */
function limitOf(
  s: Pick<LimitHeldAllStatement, "componentId" | "limitName">,
  v: Vocabulary,
): string {
  return v.limit({ componentId: s.componentId, id: s.limitName });
}

function reasonOf(
  s: Pick<NoLimitRefusesStatement, "componentId" | "reason">,
  v: Vocabulary,
): string {
  return v.reason({ componentId: s.componentId, id: s.reason });
}

/** "connections and queryWorkers", as the component's type words them. */
function limitsOf(s: NoRefusingLimitRanOutStatement, v: Vocabulary): Message {
  return listOf(
    s.limitNames.map((name) => say`${limitOf({ ...s, limitName: name }, v)}`),
  );
}

const REFUSE: PluralForms = ["refuses", "refuse"];
const NONE_RAN_OUT: PluralForms = ["it never ran out", "none ran out"];

/**
 * How limit-refused words its statements, at both lengths. A detector that
 * makes them registers it as its `phrases`.
 */
export const LIMIT_REFUSED_PHRASES: Phrases<LimitRefusedStatement> = {
  "no-limit-refuses": {
    long: (s, v) =>
      say`No limit of ${component(s.componentId)} refuses with ${reasonOf(s, v)}, so the run can't say what ran out.`,
    short: (s, v) =>
      say`no limit of ${component(s.componentId)} refuses with ${reasonOf(s, v)}`,
  },
  "no-refusing-limit-ran-out": {
    long: (s, v) =>
      say`${component(s.componentId)}'s ${limitsOf(s, v)} ${plural(s.limitNames.length, REFUSE)} with ${reasonOf(s, v)}, but ${plural(s.limitNames.length, NONE_RAN_OUT)} in a second with these failures.`,
    short: (s, v) =>
      say`${component(s.componentId)}'s ${limitsOf(s, v)} never ran out while it refused with ${reasonOf(s, v)}`,
  },
  "limit-held-all": {
    long: (s, v) =>
      say`${component(s.componentId)} held all ${count(s.limit)} of its ${limitOf(s, v)} ${where(s.coverage)}.`,
    short: (s, v) =>
      say`${component(s.componentId)} held all ${count(s.limit)} of its ${limitOf(s, v)}`,
  },
  "bucket-ran-out": {
    long: (s, v) =>
      say`${component(s.componentId)}'s ${limitOf(s, v)} bucket, which holds ${count(s.limit)} tokens, had less than one left ${where(s.coverage)}.`,
    short: (s, v) =>
      say`${component(s.componentId)}'s ${limitOf(s, v)} bucket ran out`,
  },
  "refused-attempts-failed": {
    long: (s) =>
      say`${component(s.componentId)} refused ${count(s.rejected)} ${plural(s.rejected, ["attempt", "attempts"])}, and each one failed ${lookup(ENDED_WORK, s.ended)}.`,
    short: (s) =>
      say`every attempt ${component(s.componentId)} refused failed ${lookup(ENDED_WORK, s.ended)}`,
  },
};
