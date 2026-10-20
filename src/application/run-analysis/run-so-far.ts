import type { MetricsSnapshot } from "../../domain/metrics/metrics-snapshot";
import type { Project } from "../../domain/model/project";

/**
 * A run as far as it has got: the project it runs and the snapshots
 * received, one per simulated second, in order. A finished run is the same
 * shape with every snapshot present.
 */
export interface RunSoFar {
  readonly project: Project;
  readonly snapshots: readonly MetricsSnapshot[];
}
