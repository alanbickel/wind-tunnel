import { componentTotals } from "./run-totals";
import { limitPeaks } from "./limit-peaks";
import type { RunSoFar } from "./run-so-far";
import type { ComponentStatus } from "./status-words";

export { STATUS_WORDS, type ComponentStatus } from "./status-words";

/**
 * Each component's status in the run so far, by component ID. Refused wins
 * over waited, since it's the one that lost requests. A component with no
 * limits can't have waited. Before the first snapshot every component is
 * `ok`: nothing has been refused, and no limit has been reported.
 */
export function componentStatuses(
  run: RunSoFar,
): ReadonlyMap<string, ComponentStatus> {
  const waiting = componentsThatWaited(run);
  return new Map(
    componentTotals(run).map(({ id, rejected }) => [
      id,
      statusOf({ rejected, waited: waiting.has(id) }),
    ]),
  );
}

/** The IDs of the components a limit made work wait at, in the run so far. */
export function componentsThatWaited(run: RunSoFar): ReadonlySet<string> {
  return new Set(
    limitPeaks(run)
      .filter((peak) => peak.whenFull.kind === "wait" && peak.exhausted)
      .map((peak) => peak.componentId),
  );
}

/** What decides one component's status. */
export interface StatusInput {
  readonly rejected: number;
  /** Whether a limit that makes work wait when full ran out. */
  readonly waited: boolean;
}

/** One component's status, by the rule `componentStatuses` gives. */
export function statusOf({ rejected, waited }: StatusInput): ComponentStatus {
  if (rejected > 0) return "refused";
  return waited ? "waited" : "ok";
}
