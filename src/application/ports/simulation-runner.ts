import type {
  MetricsRun,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import type { Project } from "../../domain/model/project";

export interface SimulationRequest {
  /** A project that passed validation, with any seed override already applied. */
  readonly project: Project;
  readonly workloadId: string;
}

/**
 * Runs a simulation somewhere and streams its per-second snapshots (MVP
 * design §5.1). Takes plain data only, so the request can be sent to a Web
 * Worker; the adapter owns the component registry. The browser adapter runs
 * in a Worker (M3); tests and the CLI run in-process.
 */
export interface SimulationRunner {
  /**
   * Resolves with the whole run once it finishes. `onSnapshot` gets each
   * snapshot as it's produced, in order, before the promise resolves.
   */
  run(
    request: SimulationRequest,
    onSnapshot?: (snapshot: MetricsSnapshot) => void,
  ): Promise<MetricsRun>;
}
