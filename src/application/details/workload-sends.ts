import type { Workload } from "../../domain/model/project";
import { apportion } from "./apportion";
import { profileLine, type ProfileLinePoint } from "./profile-line";

/** What a workload's profile and mix send before the duration ends. */
export interface WorkloadSends {
  /** About how many requests the profile sends; a multiple of `unit`. */
  readonly totalRequests: number;
  /** What `totalRequests` and each entry's figure are rounded to: 1, 10, 100, … */
  readonly unit: number;
  /** The highest rate on the line before the end. */
  readonly peakRequestsPerSec: number;
  /**
   * About how many requests each mix entry gets, in mix order, adding up to
   * exactly `totalRequests`. Undefined when no entry has a positive weight.
   */
  readonly perEntryRequests: readonly number[] | undefined;
}

/** How many significant digits the total keeps: 65,974 is "about 66,000". */
const SIGNIFICANT_DIGITS = 3;

/**
 * What a workload sends, worked out from the same line the preview chart
 * draws (`profileLine`, which reads the engine's `rateAt`). The profile is
 * piecewise linear, so the area under that line is the expected number of
 * requests exactly. It's rounded to three significant digits, and the mix
 * divides those units by the largest-remainder rule the shares use, so the
 * parts add up to the total exactly. Undefined for a profile with no points,
 * which has no line.
 */
export function workloadSends(
  workload: Pick<Workload, "profile" | "durationMs" | "mix">,
): WorkloadSends | undefined {
  const { within } = profileLine(workload);
  if (within.length === 0) return undefined;
  const expected = areaUnder(within);
  const unit = unitFor(expected);
  const totalUnits = Math.round(expected / unit);
  const parts = apportion(
    workload.mix.map((entry) => entry.weight),
    totalUnits,
  );
  return {
    totalRequests: totalUnits * unit,
    unit,
    peakRequestsPerSec: Math.max(...within.map((p) => p.requestsPerSec)),
    perEntryRequests: parts?.map((units) => units * unit),
  };
}

/** The area under a line of straight segments, by the trapezoid rule. */
function areaUnder(line: readonly ProfileLinePoint[]): number {
  let area = 0;
  for (const [index, to] of line.entries()) {
    const from = line[index - 1];
    if (from === undefined) continue;
    const seconds = to.timeSec - from.timeSec;
    area += (seconds * (from.requestsPerSec + to.requestsPerSec)) / 2;
  }
  return area;
}

/** 1 up to 999 requests, then 10, 100, … so three digits are kept. */
function unitFor(requests: number): number {
  if (!(requests >= 1)) return 1;
  const digits = Math.floor(Math.log10(requests)) + 1;
  return 10 ** Math.max(0, digits - SIGNIFICANT_DIGITS);
}
