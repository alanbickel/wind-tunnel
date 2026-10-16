import type {
  MetricsRun,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import type {
  SimulationRequest,
  SimulationRunner,
} from "../ports/simulation-runner";

/**
 * Records each request instead of simulating it, and plays back
 * `FAKE_RUN`'s snapshots before resolving with it.
 */
export class RecordingSimulationRunner implements SimulationRunner {
  readonly requests: SimulationRequest[] = [];

  run(
    request: SimulationRequest,
    onSnapshot?: (snapshot: MetricsSnapshot) => void,
  ): Promise<MetricsRun> {
    this.requests.push(request);
    FAKE_RUN.snapshots.forEach((snapshot) => onSnapshot?.(snapshot));
    return Promise.resolve(FAKE_RUN);
  }
}

function emptySnapshot(startMs: number, endMs: number): MetricsSnapshot {
  return { startMs, endMs, components: {}, workflows: {} };
}

/** Two empty one-second snapshots. */
export const FAKE_RUN: MetricsRun = {
  eventsProcessed: 0,
  snapshots: [emptySnapshot(0, 1_000), emptySnapshot(1_000, 2_000)],
  totals: emptySnapshot(0, 2_000),
};
