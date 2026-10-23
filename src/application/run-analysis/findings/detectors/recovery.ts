import type { LimitUse } from "../../../../domain/metrics/metrics-snapshot";
import { runFinished, type RunSoFar } from "../../run-so-far";
import { limitUseIn } from "../limit-ref";
import type { FailureCause } from "./failure-causes";
import type {
  LimitPeakedAfterStatement,
  RecoveryStatement,
} from "./recovery-phrases";

// The recovery part of failed-requests (findings.md §2.1): whether the
// failures stopped before the run did. Like limit-refused, a helper that
// detector calls. Its phrases are in `recovery-phrases.ts`.

/** A failure cause, and the limits named as refusing it. */
export interface RecoveryInput {
  readonly run: RunSoFar;
  readonly cause: FailureCause;
  readonly limits: readonly LimitUse[];
}

/** When the failures stopped, and how much of each limit was used after. */
export function recovery(input: RecoveryInput): RecoveryStatement[] {
  const { run, cause } = input;
  const last = cause.seconds.at(-1) ?? 0;
  const lastSnapshot = run.snapshots.at(-1);
  if (last === run.snapshots.length - 1 || lastSnapshot === undefined) {
    return [{ kind: "requests-still-failing", finished: runFinished(run) }];
  }
  const lastFailedMs = run.snapshots[last]?.endMs ?? 0;
  const quietMs = lastSnapshot.endMs - lastFailedMs;
  return [
    { kind: "failures-stopped", lastFailedMs, quietMs },
    ...input.limits.map((limit) => peakAfter({ ...input, limit, after: last })),
  ];
}

/** A limit to read after the last failure. */
interface PeakAfterInput extends RecoveryInput {
  readonly limit: LimitUse;
  /** The index of the last snapshot with a failure. */
  readonly after: number;
}

function peakAfter({
  run,
  cause,
  limit,
  after,
}: PeakAfterInput): LimitPeakedAfterStatement {
  const ref = { componentId: cause.componentId, name: limit.name };
  const peaks = run.snapshots
    .slice(after + 1)
    .map((s) => limitUseIn(s, ref)?.peak ?? 0);
  const peak = Math.max(...peaks);
  return {
    kind: "limit-peaked-after",
    componentId: cause.componentId,
    limitName: limit.name,
    limit: { kind: limit.kind, limit: limit.limit },
    peak,
  };
}
