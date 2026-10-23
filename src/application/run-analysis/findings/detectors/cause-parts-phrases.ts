import { component, say } from "../message";
import type { Phrases, Statement } from "../phrase";
import {
  LIMIT_REFUSED_PHRASES,
  type LimitRefusedStatement,
} from "./limit-refused-phrases";

// What failed-requests and failed-deliveries both say about a cause.

/** The caller stopped waiting, and no limit says why the work was slow. */
export interface CallerStoppedWaitingStatement extends Statement {
  readonly kind: "caller-stopped-waiting";
  readonly componentId: string;
}

/** Why work failed: the limit that refused it, or that none explains it. */
export type CauseStatement =
  CallerStoppedWaitingStatement | LimitRefusedStatement;

/**
 * How cause-parts, with limit-refused's, words its statements, at both
 * lengths. A detector that makes them registers it as its `phrases`.
 */
export const CAUSE_PHRASES: Phrases<CauseStatement> = {
  ...LIMIT_REFUSED_PHRASES,
  "caller-stopped-waiting": {
    long: (s) =>
      say`The caller stopped waiting for ${component(s.componentId)}. No limit explains a timeout, so the run can't say why it was slow.`,
    short: (s) =>
      say`the caller stopped waiting for ${component(s.componentId)}, and no limit explains why it was slow`,
  },
};
