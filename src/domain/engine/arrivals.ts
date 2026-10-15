import type { ProfilePoint } from "../model/project";

/**
 * Target request rate at `atMs`: linear between profile points, flat before
 * the first point and after the last (MVP design §3.4).
 */
export function rateAt(profile: readonly ProfilePoint[], atMs: number): number {
  const index = profile.findIndex((point) => atMs <= point.atMs);
  const point = profile[index];
  // Past the last point (index -1), or an empty profile.
  if (point === undefined) return profile.at(-1)?.requestsPerSec ?? 0;
  const previous = profile[index - 1];
  if (previous === undefined || point.atMs === previous.atMs) {
    return point.requestsPerSec;
  }
  return interpolate({ from: previous, to: point, atMs });
}

interface Interpolation {
  readonly from: ProfilePoint;
  readonly to: ProfilePoint;
  /** Between `from.atMs` and `to.atMs`. */
  readonly atMs: number;
}

/** The rate on the straight line between two profile points. */
function interpolate({ from, to, atMs }: Interpolation): number {
  const share = (atMs - from.atMs) / (to.atMs - from.atMs);
  return (
    from.requestsPerSec + share * (to.requestsPerSec - from.requestsPerSec)
  );
}
