import type { MetricsSnapshot } from "../../domain/metrics/metrics-snapshot";
import type { Project, Workload } from "../../domain/model/project";

/**
 * A run as far as it has got: the project it runs, the workload it runs,
 * and the snapshots received, one per simulated second, in order. A
 * finished run is the same shape with every snapshot present; `runFinished`
 * tells them apart.
 */
export interface RunSoFar {
  readonly project: Project;
  /** The ID of one of `project.workloads`. */
  readonly workloadId: string;
  readonly snapshots: readonly MetricsSnapshot[];
}

/** The workload the run runs, or undefined if the project doesn't have it. */
export function workloadOf({
  project,
  workloadId,
}: RunSoFar): Workload | undefined {
  return project.workloads.find((w) => w.id === workloadId);
}

/**
 * Whether the run reached the end of its workload: the last snapshot ends
 * at the workload's duration. A run stopped early, or one still going, has
 * not finished, so what's said about it holds only "so far".
 */
export function runFinished(run: RunSoFar): boolean {
  const workload = workloadOf(run);
  const endMs = run.snapshots.at(-1)?.endMs;
  if (workload === undefined || endMs === undefined) return false;
  return endMs >= workload.durationMs;
}
