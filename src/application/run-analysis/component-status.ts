import { componentTotals } from "./run-totals";
import { limitPeaks } from "./limit-peaks";
import type { RunSoFar } from "./run-so-far";

/**
 * How one component did in the run so far, in the words the findings use:
 * - `refused`: it turned work away (its `rejected` is above 0).
 * - `waited`: it refused nothing, but a limit that makes work wait when full
 *   ran out at its peak.
 * - `ok`: neither.
 */
export type ComponentStatus = "refused" | "waited" | "ok";

/**
 * Each status's word, as a badge says it. The findings' phrasebook words
 * "refused" in its own sentences and has no entry to share, so these are
 * written to match it, not built from it; nothing in code keeps the two
 * together.
 */
export const STATUS_WORDS: Readonly<Record<ComponentStatus, string>> = {
  refused: "refused",
  waited: "waited",
  ok: "ok",
};

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
