import type { RunSoFar } from "../../run-so-far";
import type { TimeWindow } from "../finding";
import { spanOf } from "../time-window";
import type { CauseStatement } from "./cause-parts-phrases";
import {
  endedByRejections,
  isTimeout,
  type FailureCause,
  type RunCauses,
} from "./failure-causes";
import { limitRefused, type LimitRefusal } from "./limit-refused";

// What failed-requests and failed-deliveries both say about a cause: when
// it failed, which limit refused, and where that began. Its phrases are in
// `cause-parts-phrases.ts`.

/** A run, and every cause of failed work in it. */
export interface CauseContext {
  readonly run: RunSoFar;
  readonly causes: RunCauses;
}

/** The limit-refused part, for a rejection; a timeout has none. */
export function refusalOf(
  cause: FailureCause,
  { run, causes }: CauseContext,
): LimitRefusal | undefined {
  if (isTimeout(cause)) return undefined;
  const endedAtComponent = endedByRejections(causes, cause.componentId);
  return limitRefused({ run, cause, endedAtComponent });
}

/** From the start of the cause's first second to the end of its last. */
export function windowOf(cause: FailureCause, run: RunSoFar): TimeWindow {
  return spanOf({
    snapshots: run.snapshots,
    first: cause.seconds[0] ?? 0,
    last: cause.seconds.at(-1) ?? 0,
  });
}

/** Where the cause began, if before the window, and the window it leads to. */
export interface CauseWindowInput {
  readonly refusal: LimitRefusal | undefined;
  readonly window: TimeWindow;
  readonly run: RunSoFar;
}

export function causeWindowOf({
  refusal,
  window,
  run,
}: CauseWindowInput): TimeWindow | undefined {
  const start = refusal?.causeStartIndex;
  if (start === undefined) return undefined;
  const fromMs = run.snapshots[start]?.startMs ?? window.fromMs;
  return { fromMs, toMs: window.toMs };
}

/** Why the work failed: the limit that refused, or that no limit explains. */
export function refusalReasons(
  { componentId }: FailureCause,
  refusal: LimitRefusal | undefined,
): readonly CauseStatement[] {
  return refusal?.reasons ?? [{ kind: "caller-stopped-waiting", componentId }];
}
