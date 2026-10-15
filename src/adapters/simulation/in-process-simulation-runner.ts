import type { ComponentRegistry } from "../../domain/components/component-registry";
import {
  simulateWithMetrics,
  type MetricsRun,
  type MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import type {
  SimulationRequest,
  SimulationRunner,
} from "../../application/ports/simulation-runner";

export interface InProcessSimulationRunnerDependencies {
  readonly registry: ComponentRegistry;
}

/**
 * The `SimulationRunner` that runs on the caller's thread, for the CLI and
 * tests. It blocks until the run ends, so the browser uses a Worker instead
 * (M3). Snapshots reach `onSnapshot` as each simulated second closes.
 */
export class InProcessSimulationRunner implements SimulationRunner {
  private readonly registry: ComponentRegistry;

  constructor({ registry }: InProcessSimulationRunnerDependencies) {
    this.registry = registry;
  }

  run(
    request: SimulationRequest,
    onSnapshot?: (snapshot: MetricsSnapshot) => void,
  ): Promise<MetricsRun> {
    const input = { ...request, registry: this.registry, onSnapshot };
    // Inside the executor, an engine error rejects the promise instead of
    // throwing at the caller, as a Worker's failure would.
    return new Promise((resolve) => {
      resolve(simulateWithMetrics(input));
    });
  }
}
