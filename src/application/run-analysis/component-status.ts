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
  const waiting = new Set(
    limitPeaks(run)
      .filter((peak) => peak.whenFull.kind === "wait" && peak.exhausted)
      .map((peak) => peak.componentId),
  );
  return new Map(
    componentTotals(run).map(({ id, rejected }) => [
      id,
      statusOf({ rejected, waited: waiting.has(id) }),
    ]),
  );
}

/** What decides one component's status. */
interface StatusInput {
  readonly rejected: number;
  /** Whether a limit that makes work wait when full ran out. */
  readonly waited: boolean;
}

function statusOf({ rejected, waited }: StatusInput): ComponentStatus {
  if (rejected > 0) return "refused";
  return waited ? "waited" : "ok";
}
