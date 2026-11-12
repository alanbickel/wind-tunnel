import { rateAt } from "../../domain/engine/arrivals";
import type { Workload } from "../../domain/model/project";
import { inTimeOrder } from "../edits/profile-points";

/** One vertex of the line: a time and the rate there. */
export interface ProfileLinePoint {
  readonly timeSec: number;
  readonly requestsPerSec: number;
}

/** What the preview chart draws for a workload. */
export interface ProfileLine {
  /** The line the run reads: from the start to the run's end. */
  readonly within: readonly ProfileLinePoint[];
  /**
   * The rest of the line, past the run's end: it starts at the end, so it
   * joins `within`, and runs through each point after it. Empty if there's
   * none. Drawn muted: the run stops before it.
   */
  readonly beyond: readonly ProfileLinePoint[];
  /** Where the run ends, in seconds. */
  readonly endSec: number;
  /** Says where the run ends, e.g. "Run ends at 60 s". */
  readonly endText: string;
}

/**
 * The line a workload's profile makes, as the engine reads it: every rate
 * comes from `rateAt`, so the picture is the run's input, not a second
 * opinion. It's flat before the first point and after the last, and it stops
 * at the duration. It's built from the profile as given, a stored one that's
 * out of order included, taken in time order. An empty profile has no line.
 */
export function profileLine(
  workload: Pick<Workload, "profile" | "durationMs">,
): ProfileLine {
  const { durationMs } = workload;
  const profile = inTimeOrder(workload.profile);
  const at = (timeMs: number): ProfileLinePoint => ({
    timeSec: timeMs / 1000,
    requestsPerSec: rateAt(profile, timeMs),
  });
  const times = profile.map((point) => point.atMs);
  const withinTimes = [0, ...times.filter((t) => t > 0 && t < durationMs)];
  const beyondTimes = times.filter((t) => t > durationMs);
  const empty = profile.length === 0;
  return {
    within: empty ? [] : [...unique(withinTimes), durationMs].map(at),
    beyond:
      empty || beyondTimes.length === 0
        ? []
        : [durationMs, ...unique(beyondTimes)].map(at),
    endSec: durationMs / 1000,
    endText: `Run ends at ${String(durationMs / 1000)} s`,
  };
}

/** The times, each once, keeping their order. */
function unique(times: readonly number[]): number[] {
  return [...new Set(times)];
}
