import { allWorkflows, workflowTotals } from "../../run-totals";
import type { RunSoFar } from "../../run-so-far";
import { adviceFor, type FindingsCatalog } from "../catalog/type-advice";
import type { Detector } from "../detector";
import type { DetectedFinding, Evidence, TimeWindow } from "../finding";
import { findingKey } from "../finding-key";
import {
  causeWindowOf,
  refusalOf,
  refusalReasons,
  windowOf,
} from "./cause-parts";
import {
  FAILED_REQUESTS_PHRASES,
  type FailedByWorkflowStatement,
  type FailedRequestsStatement,
  type WorstSecondStatement,
} from "./failed-requests-phrases";
import {
  isTimeout,
  runCauses,
  type FailureCause,
  type RunCauses,
} from "./failure-causes";
import type { LimitRefusal } from "./limit-refused";
import { recovery } from "./recovery";

export const FAILED_REQUESTS = "failed-requests";

/**
 * One failure finding per cause of failed requests (findings.md §2.1). Its
 * `affected` is that cause's failed requests, so the findings add up to
 * the run's failures. A cause no limit explains, such as a timeout, still
 * gets a finding, without the limit-refused part.
 */
export function failedRequestsDetector(catalog: FindingsCatalog): Detector {
  return {
    id: FAILED_REQUESTS,
    detect: (run) => {
      const causes = runCauses(run);
      const answered = answeredRequests(run);
      return causes.requests.map((cause) =>
        failureFinding(cause, { run, catalog, causes, answered }),
      );
    },
    phrases: FAILED_REQUESTS_PHRASES,
  };
}

/** What every cause's finding reads besides the cause. */
interface FailureContext {
  readonly run: RunSoFar;
  readonly catalog: FindingsCatalog;
  /** Every cause of failed requests and of failed deliveries. */
  readonly causes: RunCauses;
  /** Requests answered so far, succeeded or failed, over every workflow. */
  readonly answered: number;
}

function failureFinding(
  cause: FailureCause,
  context: FailureContext,
): DetectedFinding {
  const { run } = context;
  const { componentId, reason } = cause;
  const refusal = refusalOf(cause, context);
  const limitNames = (refusal?.limits ?? []).map((l) => l.name);
  const window = windowOf(cause, run);
  return {
    key: findingKey({ kind: FAILED_REQUESTS, componentId, reason }),
    severity: "failure",
    limitNames,
    window,
    causeWindow: causeWindowOf({ refusal, window, run }),
    summary: summaryOf(cause, window),
    reasons: reasonsOf({ cause, context, refusal }),
    evidence: [...causeEvidence(cause, context), ...(refusal?.evidence ?? [])],
    ...adviceFor(context.catalog, {
      project: run.project,
      componentId,
      limitNames,
    }),
    explains: undefined,
    affected: cause.failed,
  };
}

/** A cause, what's read besides it, and the limit-refused part, if any. */
interface ReasonsInput {
  readonly cause: FailureCause;
  readonly context: FailureContext;
  readonly refusal: LimitRefusal | undefined;
}

function reasonsOf({
  cause,
  context,
  refusal,
}: ReasonsInput): FailedRequestsStatement[] {
  const { run } = context;
  return [
    workflowsStatement(cause, context),
    worstStatement(cause, run),
    ...refusalReasons(cause, refusal),
    ...recovery({ run, cause, limits: refusal?.limits ?? [] }),
  ];
}

function answeredRequests(run: RunSoFar): number {
  const all = allWorkflows(workflowTotals(run));
  return all.succeeded + all.failed;
}

function summaryOf(
  cause: FailureCause,
  window: TimeWindow,
): FailedRequestsStatement {
  const { componentId, reason, failed } = cause;
  if (isTimeout(cause)) {
    return { kind: "requests-timed-out", componentId, failed, window };
  }
  return { kind: "requests-failed", componentId, reason, failed, window };
}

/** "That's 23,183 Get order and 5,658 Create order requests, …" */
function workflowsStatement(
  cause: FailureCause,
  { answered }: FailureContext,
): FailedByWorkflowStatement {
  return {
    kind: "failed-by-workflow",
    workflows: [...cause.bySource].map(([workflowId, failed]) => ({
      workflowId,
      failed,
    })),
    failed: cause.failed,
    answered,
  };
}

function worstStatement(
  { worst }: FailureCause,
  run: RunSoFar,
): WorstSecondStatement {
  const endMs = run.snapshots[worst.index]?.endMs ?? 0;
  return { kind: "worst-second", failed: worst.failed, endMs };
}

function causeEvidence(
  cause: FailureCause,
  { answered }: FailureContext,
): Evidence[] {
  return [
    {
      what: `${cause.cause}: failed requests`,
      value: cause.failed,
      source: "totals",
    },
    ...[...cause.bySource].map(([id, failed]): Evidence => ({
      what: `${cause.cause}: failed ${id} requests`,
      value: failed,
      source: "totals",
    })),
    { what: "requests answered", value: answered, source: "totals" },
    {
      what: `${cause.cause}: seconds with a failure`,
      value: cause.seconds.length,
      source: "snapshots",
    },
  ];
}
