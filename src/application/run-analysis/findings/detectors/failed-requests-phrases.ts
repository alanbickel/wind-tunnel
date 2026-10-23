import type { TimeWindow } from "../finding";
import {
  at,
  component,
  count,
  listOf,
  plural,
  say,
  share,
  type Message,
} from "../message";
import type { Phrases, Statement } from "../phrase";
import { CAUSE_PHRASES, type CauseStatement } from "./cause-parts-phrases";
import { RECOVERY_PHRASES, type RecoveryStatement } from "./recovery-phrases";

/** Requests failed because a component refused them. */
export interface RequestsFailedStatement extends Statement {
  readonly kind: "requests-failed";
  readonly componentId: string;
  readonly reason: string;
  readonly failed: number;
  readonly window: TimeWindow;
}

/** Requests failed because their caller stopped waiting for a component. */
export interface RequestsTimedOutStatement extends Statement {
  readonly kind: "requests-timed-out";
  readonly componentId: string;
  readonly failed: number;
  readonly window: TimeWindow;
}

/** The cause's failed requests by workflow, against those answered. */
export interface FailedByWorkflowStatement extends Statement {
  readonly kind: "failed-by-workflow";
  /** In the order each workflow first failed. */
  readonly workflows: readonly WorkflowFailures[];
  readonly failed: number;
  /** Requests answered so far, succeeded or failed, over every workflow. */
  readonly answered: number;
}

/** One workflow's requests that failed with the cause. */
export interface WorkflowFailures {
  readonly workflowId: string;
  readonly failed: number;
}

/** The second with the most failures from the cause. */
export interface WorstSecondStatement extends Statement {
  readonly kind: "worst-second";
  readonly failed: number;
  readonly endMs: number;
}

/** Every statement failed-requests makes. */
export type FailedRequestsStatement =
  | RequestsFailedStatement
  | RequestsTimedOutStatement
  | FailedByWorkflowStatement
  | WorstSecondStatement
  | CauseStatement
  | RecoveryStatement;

/** "28,841 requests" */
function requests(failed: number): Message {
  return say`${count(failed)} ${plural(failed, ["request", "requests"])}`;
}

/** "from 14 s to 47 s" */
function during({ fromMs, toMs }: TimeWindow): Message {
  return say`from ${at(fromMs)} to ${at(toMs)}`;
}

/**
 * How failed-requests words its statements, at both lengths. A detector that
 * makes them registers it as its `phrases`.
 */
export const FAILED_REQUESTS_PHRASES: Phrases<FailedRequestsStatement> = {
  ...CAUSE_PHRASES,
  ...RECOVERY_PHRASES,
  "requests-failed": {
    long: (s, v) =>
      say`${requests(s.failed)} failed with ${component(s.componentId)}: ${v.reason({ componentId: s.componentId, id: s.reason })}, ${during(s.window)}.`,
    short: (s, v) =>
      say`${requests(s.failed)} failed with ${component(s.componentId)}: ${v.reason({ componentId: s.componentId, id: s.reason })}`,
  },
  "requests-timed-out": {
    long: (s) =>
      say`${requests(s.failed)} failed because ${component(s.componentId)} didn't answer in time, ${during(s.window)}.`,
    short: (s) =>
      say`${requests(s.failed)} failed because ${component(s.componentId)} didn't answer in time`,
  },
  "failed-by-workflow": {
    long: (s, v) => {
      const parts = s.workflows.map(
        (w) => say`${count(w.failed)} ${v.workflow(w.workflowId)}`,
      );
      return say`That's ${listOf(parts)} ${plural(s.failed, ["request", "requests"])}, ${share(s.failed / s.answered)} of the ${count(s.answered)} answered.`;
    },
    short: (s) =>
      say`that's ${share(s.failed / s.answered)} of the ${count(s.answered)} answered`,
  },
  "worst-second": {
    long: (s) =>
      say`The most in one second was ${count(s.failed)}, in the second ending at ${at(s.endMs)}.`,
    short: (s) =>
      say`the most in one second was ${count(s.failed)}, ending at ${at(s.endMs)}`,
  },
};
