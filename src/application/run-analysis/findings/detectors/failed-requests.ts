import { allWorkflows, workflowTotals } from "../../run-totals";
import type { RunSoFar } from "../../run-so-far";
import { adviceFor, type FindingsCatalog } from "../catalog/type-advice";
import type { Detector } from "../detector";
import type { DetectedFinding, Evidence, TimeWindow } from "../finding";
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
import { findingKey } from "../finding-key";
import { spanOf } from "../time-window";
import { failureCauses, isTimeout, type FailureCause } from "./failure-causes";
import { limitRefused, type LimitRefusal } from "./limit-refused";
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
      const causes = failureCauses(run);
      const answered = answeredRequests(run);
      return causes.map((cause) =>
        failureFinding(cause, { run, catalog, causes, answered }),
      );
    },
  };
}

/** What every cause's finding reads besides the cause. */
interface FailureContext {
  readonly run: RunSoFar;
  readonly catalog: FindingsCatalog;
  readonly causes: readonly FailureCause[];
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

function reasonsOf({ cause, context, refusal }: ReasonsInput): Message[] {
  const { run } = context;
  return [
    workflowsSentence(cause, context),
    worstSentence(cause, run),
    ...(refusal?.reasons ?? [timeoutSentence(cause)]),
    ...recovery({ run, cause, limits: refusal?.limits ?? [] }),
  ];
}

/** The limit-refused part, for a rejection; a timeout has none. */
function refusalOf(
  cause: FailureCause,
  { run, causes }: FailureContext,
): LimitRefusal | undefined {
  if (isTimeout(cause)) return undefined;
  const failedAtComponent = causes
    .filter((c) => c.componentId === cause.componentId && !isTimeout(c))
    .reduce((n, c) => n + c.failed, 0);
  return limitRefused({ run, cause, failedAtComponent });
}

function answeredRequests(run: RunSoFar): number {
  const all = allWorkflows(workflowTotals(run));
  return all.succeeded + all.failed;
}

function windowOf(cause: FailureCause, run: RunSoFar): TimeWindow {
  return spanOf({
    snapshots: run.snapshots,
    first: cause.seconds[0] ?? 0,
    last: cause.seconds.at(-1) ?? 0,
  });
}

/** Where the cause began, if before the window, and the window it leads to. */
interface CauseWindowInput {
  readonly refusal: LimitRefusal | undefined;
  readonly window: TimeWindow;
  readonly run: RunSoFar;
}

function causeWindowOf({
  refusal,
  window,
  run,
}: CauseWindowInput): TimeWindow | undefined {
  const start = refusal?.causeStartIndex;
  if (start === undefined) return undefined;
  const fromMs = run.snapshots[start]?.startMs ?? window.fromMs;
  return { fromMs, toMs: window.toMs };
}

function summaryOf(cause: FailureCause, window: TimeWindow): Message {
  const requests = say`${count(cause.failed)} ${plural(cause.failed, ["request", "requests"])}`;
  const when = say`from ${at(window.fromMs)} to ${at(window.toMs)}`;
  if (isTimeout(cause)) {
    return say`${requests} failed because ${component(cause.componentId)} didn't answer in time, ${when}.`;
  }
  return say`${requests} failed with ${component(cause.componentId)}: ${cause.reason}, ${when}.`;
}

/** "That's 23,183 Get order and 5,658 Create order requests, …" */
function workflowsSentence(
  cause: FailureCause,
  { run, answered }: FailureContext,
): Message {
  const names = new Map(run.project.workflows.map((w) => [w.id, w.name]));
  const parts = [...cause.byWorkflow].map(
    ([id, failed]) => say`${count(failed)} ${names.get(id) ?? id}`,
  );
  return say`That's ${listOf(parts)} ${plural(cause.failed, ["request", "requests"])}, ${share(cause.failed / answered)} of the ${count(answered)} answered.`;
}

function worstSentence({ worst }: FailureCause, run: RunSoFar): Message {
  const endMs = run.snapshots[worst.index]?.endMs ?? 0;
  return say`The most in one second was ${count(worst.failed)}, in the second ending at ${at(endMs)}.`;
}

function timeoutSentence({ componentId }: FailureCause): Message {
  return say`The caller stopped waiting for ${component(componentId)}. No limit explains a timeout, so the run can't say why it was slow.`;
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
    ...[...cause.byWorkflow].map(([id, failed]): Evidence => ({
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
