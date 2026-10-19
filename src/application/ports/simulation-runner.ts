import type {
  MetricsRun,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import type { Project } from "../../domain/model/project";
import type { StopSignal } from "./stop-signal";

export interface SimulationRequest {
  /** A project that passed validation, with any seed override already applied. */
  readonly project: Project;
  readonly workloadId: string;
}

export interface SimulationRunInput {
  /** Plain data, so a runner can post it to a Web Worker as is. */
  readonly request: SimulationRequest;
  /** Gets each snapshot as it's produced, in order. */
  readonly onSnapshot?: (snapshot: MetricsSnapshot) => void;
  /** Stops the run when it fires; the outcome is then `stopped`. */
  readonly stopSignal?: StopSignal;
}

export type SimulationOutcome = SimulationFinished | SimulationStopped;

export interface SimulationFinished {
  readonly status: "finished";
  readonly run: MetricsRun;
}

/** The run was stopped before it finished; no snapshot follows the stop. */
export interface SimulationStopped {
  readonly status: "stopped";
}

/**
 * Runs a simulation somewhere and streams its per-second snapshots (MVP
 * design §5.1). Takes plain data only, so the request can be sent to a Web
 * Worker; the adapter owns the component registry. The browser runs in a
 * Worker; tests and the CLI run in-process.
 */
export interface SimulationRunner {
  /**
   * Resolves once the run finishes or is stopped. Every snapshot reaches
   * `onSnapshot` before the promise resolves, and none arrives after the
   * stop signal fires. Rejects if the engine fails.
   */
  run(input: SimulationRunInput): Promise<SimulationOutcome>;
}
