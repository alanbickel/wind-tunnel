import type { ComponentRegistry } from "../../domain/components/component-registry";
import {
  simulateWithMetrics,
  type MetricsRun,
  type MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import type { SimulationRequest } from "../../application/ports/simulation-runner";

// The messages between `WebWorkerSimulationRunner` and its Worker. All are
// plain data, so they survive the structured clone `postMessage` makes.

/** Page → Worker: start a run. A Worker serves one run, then is terminated. */
export interface RunMessage {
  readonly kind: "run";
  readonly request: SimulationRequest;
}

/** Worker → page: one simulated second closed. */
export interface SnapshotReply {
  readonly kind: "snapshot";
  readonly snapshot: MetricsSnapshot;
}

/** Worker → page: the run ended; the last message of a run. */
export interface FinishedReply {
  readonly kind: "finished";
  readonly run: MetricsRun;
}

/** Worker → page: the engine threw; the last message of a run. */
export interface FailedReply {
  readonly kind: "failed";
  readonly message: string;
}

export type WorkerReply = SnapshotReply | FinishedReply | FailedReply;

export interface ServeRunInput {
  readonly request: SimulationRequest;
  readonly registry: ComponentRegistry;
  /** Sends a reply to the page, e.g. the Worker's `postMessage`. */
  readonly post: (reply: WorkerReply) => void;
}

/**
 * The Worker's side of a run: simulates the request, posting each snapshot
 * as it closes, then `finished` with the whole run, or `failed` if the
 * engine throws.
 */
export function serveRun({ request, registry, post }: ServeRunInput): void {
  try {
    const run = simulateWithMetrics({
      ...request,
      registry,
      onSnapshot: (snapshot) => {
        post({ kind: "snapshot", snapshot });
      },
    });
    post({ kind: "finished", run });
  } catch (error) {
    post({ kind: "failed", message: messageOf(error) });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
