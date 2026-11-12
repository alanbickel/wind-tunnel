import type { Workload } from "../../domain/model/project";

const THOUSAND = 1000;

/** A rate in words, with thousands as "k": 2000 is "2k", 1500 is "1.5k". */
function rateText(requestsPerSec: number): string {
  if (requestsPerSec < THOUSAND) return String(requestsPerSec);
  return `${String(Math.round(requestsPerSec / 100) / 10)}k`;
}

/**
 * A workload's run in one short line, for beside the picker: how long it
 * runs and its peak rate, e.g. "20 s · 2k req/s". A workload with no profile
 * points has no rate to give, so the line is its duration alone.
 */
export function workloadSummary(
  workload: Pick<Workload, "durationMs" | "profile">,
): string {
  const duration = `${String(workload.durationMs / THOUSAND)} s`;
  if (workload.profile.length === 0) return duration;
  const peak = Math.max(...workload.profile.map((p) => p.requestsPerSec));
  return `${duration} · ${rateText(peak)} req/s`;
}
