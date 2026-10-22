import type { LimitUse } from "../../../../domain/metrics/metrics-snapshot";
import { runFinished, type RunSoFar } from "../../run-so-far";
import { amountOf, limitUseIn } from "../limit-ref";
import { at, component, duration, say, type Message } from "../message";
import type { FailureCause } from "./failure-causes";

// The recovery part of failed-requests (findings.md §2.1): whether the
// failures stopped before the run did. Like limit-refused, a helper that
// detector calls.

/** A failure cause, and the limits named as refusing it. */
export interface RecoveryInput {
  readonly run: RunSoFar;
  readonly cause: FailureCause;
  readonly limits: readonly LimitUse[];
}

/** When the failures stopped, and how much of each limit was used after. */
export function recovery(input: RecoveryInput): Message[] {
  const { run, cause } = input;
  const last = cause.seconds.at(-1) ?? 0;
  const lastSnapshot = run.snapshots.at(-1);
  if (last === run.snapshots.length - 1 || lastSnapshot === undefined) {
    return [stillFailing(run)];
  }
  const lastFailedMs = run.snapshots[last]?.endMs ?? 0;
  const quietMs = lastSnapshot.endMs - lastFailedMs;
  return [
    say`The last failure was in the second ending at ${at(lastFailedMs)}, and none followed in the ${duration(quietMs)} after it.`,
    ...input.limits.map((limit) => peakAfter({ ...input, limit, after: last })),
  ];
}

function stillFailing(run: RunSoFar): Message {
  return runFinished(run)
    ? say`Requests were still failing with it when the run ended.`
    : say`Requests are still failing with it.`;
}

/** A limit to read after the last failure. */
interface PeakAfterInput extends RecoveryInput {
  readonly limit: LimitUse;
  /** The index of the last snapshot with a failure. */
  readonly after: number;
}

function peakAfter({ run, cause, limit, after }: PeakAfterInput): Message {
  const ref = { componentId: cause.componentId, name: limit.name };
  const peaks = run.snapshots
    .slice(after + 1)
    .map((s) => limitUseIn(s, ref)?.peak ?? 0);
  const peak = Math.max(...peaks);
  return say`After it, ${component(cause.componentId)}'s ${limit.name} peaked at ${amountOf(limit, peak)}.`;
}
