import { TIMEOUT_REASON } from "../../../../domain/engine/simulation-events";
import type { RunSoFar } from "../../run-so-far";

/**
 * One cause of failed requests, e.g. `"orders-db: too-many-connections"`,
 * as the workflows' `failures` count it, over the snapshots so far.
 */
export interface FailureCause {
  /** As the snapshots key it: `"<component ID>: <reason>"`. */
  readonly cause: string;
  readonly componentId: string;
  /** The component's rejection reason, or the engine's `"timeout"`. */
  readonly reason: string;
  /** Requests that failed with this cause, over every workflow. */
  readonly failed: number;
  /** Those requests by workflow ID, in the order the workflows first failed. */
  readonly byWorkflow: ReadonlyMap<string, number>;
  /** Indexes of the snapshots with at least one such failure, in order. */
  readonly seconds: readonly number[];
  /** The second with the most such failures; the earliest of a tie. */
  readonly worst: WorstSecond;
}

/** The snapshot with the most failures of a cause, and how many. */
export interface WorstSecond {
  readonly index: number;
  readonly failed: number;
}

/** Whether the engine made the failure because a caller stopped waiting. */
export function isTimeout(cause: FailureCause): boolean {
  return cause.reason === TIMEOUT_REASON;
}

/**
 * Every cause of failed requests so far, in the order each first failed,
 * read in one pass over the snapshots.
 */
export function failureCauses(run: RunSoFar): FailureCause[] {
  const componentIds = run.project.architecture.components.map((c) => c.id);
  const tallies = new Map<string, CauseTally>();
  run.snapshots.forEach((snapshot, index) => {
    for (const [workflowId, workflow] of Object.entries(snapshot.workflows)) {
      for (const [cause, failed] of Object.entries(workflow.failures)) {
        const tally = tallies.get(cause) ?? startTally(cause, componentIds);
        tallies.set(cause, tally);
        addFailures(tally, { index, workflowId, failed });
      }
    }
  });
  return [...tallies.values()].map(finishTally);
}

/** A cause's counts while the snapshots are read. */
interface CauseTally {
  readonly cause: string;
  readonly componentId: string;
  readonly reason: string;
  failed: number;
  readonly byWorkflow: Map<string, number>;
  readonly seconds: number[];
  worst: WorstSecond;
  /** Failures so far in the latest second in `seconds`. */
  secondFailed: number;
}

/** One workflow's failures with a cause in one second. */
interface FailuresInSecond {
  readonly index: number;
  readonly workflowId: string;
  readonly failed: number;
}

function startTally(
  cause: string,
  componentIds: readonly string[],
): CauseTally {
  return {
    cause,
    ...splitCause(cause, componentIds),
    failed: 0,
    byWorkflow: new Map(),
    seconds: [],
    worst: { index: 0, failed: 0 },
    secondFailed: 0,
  };
}

function addFailures(tally: CauseTally, add: FailuresInSecond): void {
  const { index, workflowId, failed } = add;
  if (failed <= 0) return;
  tally.failed += failed;
  tally.byWorkflow.set(
    workflowId,
    (tally.byWorkflow.get(workflowId) ?? 0) + failed,
  );
  if (tally.seconds.at(-1) !== index) {
    tally.seconds.push(index);
    tally.secondFailed = 0;
  }
  tally.secondFailed += failed;
  if (tally.secondFailed > tally.worst.failed) {
    tally.worst = { index, failed: tally.secondFailed };
  }
}

function finishTally(tally: CauseTally): FailureCause {
  const { cause, componentId, reason, failed, byWorkflow, seconds, worst } =
    tally;
  return { cause, componentId, reason, failed, byWorkflow, seconds, worst };
}

/** A cause's component and reason. */
type CauseParts = Pick<FailureCause, "componentId" | "reason">;

/**
 * Splits `"<component ID>: <reason>"` (the metrics' `workflow-tally`
 * format). Matching the project's component IDs, longest first, keeps an ID
 * that itself holds ": " whole.
 */
function splitCause(
  cause: string,
  componentIds: readonly string[],
): CauseParts {
  const matches = componentIds.filter((id) => cause.startsWith(`${id}: `));
  const longest = matches.sort((a, b) => b.length - a.length)[0];
  const componentId =
    longest ?? cause.slice(0, Math.max(0, cause.indexOf(": ")));
  return { componentId, reason: cause.slice(componentId.length + 2) };
}
