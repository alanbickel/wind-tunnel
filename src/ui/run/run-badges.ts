import {
  componentStatuses,
  type ComponentStatus,
} from "../../application/run-analysis/component-status";
import type { RunSoFar } from "../../application/run-analysis/run-so-far";

/**
 * What the diagram's status badges show: each component's status in the run
 * on screen, by ID, and whether that run is out of date (ADR-0018). A
 * component with no entry, such as one added since the run, has no badge.
 */
export interface RunBadges {
  readonly statuses: ReadonlyMap<string, ComponentStatus>;
  readonly outOfDate: boolean;
}

/** The badges for the run so far, or none before the first run. */
export function runBadgesOf(
  run: RunSoFar | undefined,
  outOfDate: boolean,
): RunBadges | undefined {
  if (run === undefined) return undefined;
  return { statuses: componentStatuses(run), outOfDate };
}
