import type {
  MetricsRun,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import type {
  SimulationOutcome,
  SimulationRunInput,
  SimulationRunner,
} from "../ports/simulation-runner";

/**
 * Records each input instead of simulating it, and plays back `FAKE_RUN`'s
 * snapshots before finishing with it. Stops before the first snapshot if the
 * stop signal has already fired, and between snapshots if `onSnapshot`
 * fires it.
 */
export class RecordingSimulationRunner implements SimulationRunner {
  readonly inputs: SimulationRunInput[] = [];

  /** The request of each run, in order. */
  get requests(): SimulationRunInput["request"][] {
    return this.inputs.map((input) => input.request);
  }

  run(input: SimulationRunInput): Promise<SimulationOutcome> {
    this.inputs.push(input);
    for (const snapshot of FAKE_RUN.snapshots) {
      if (input.stopSignal?.aborted) return STOPPED;
      input.onSnapshot?.(snapshot);
    }
    if (input.stopSignal?.aborted) return STOPPED;
    return Promise.resolve({ status: "finished", run: FAKE_RUN });
  }
}

const STOPPED: Promise<SimulationOutcome> = Promise.resolve({
  status: "stopped",
});

function emptySnapshot(startMs: number, endMs: number): MetricsSnapshot {
  return { startMs, endMs, components: {}, workflows: {} };
}

/** Two empty one-second snapshots. */
export const FAKE_RUN: MetricsRun = {
  eventsProcessed: 0,
  snapshots: [emptySnapshot(0, 1_000), emptySnapshot(1_000, 2_000)],
  totals: emptySnapshot(0, 2_000),
};
