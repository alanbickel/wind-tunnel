import type { ComponentRegistry } from "../../domain/components/component-registry";
import {
  simulateWithMetrics,
  type MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import type {
  SimulationOutcome,
  SimulationRunInput,
  SimulationRunner,
} from "../../application/ports/simulation-runner";
import type { StopSignal } from "../../application/ports/stop-signal";

export interface InProcessSimulationRunnerDependencies {
  readonly registry: ComponentRegistry;
}

/**
 * The `SimulationRunner` that runs on the caller's thread, for the CLI and
 * tests. It blocks until the run ends, so the browser uses a Worker instead.
 * Snapshots reach `onSnapshot` as each simulated second closes. Since it
 * holds the thread, only a signal that has already fired, or one fired from
 * `onSnapshot`, can stop it.
 */
export class InProcessSimulationRunner implements SimulationRunner {
  private readonly registry: ComponentRegistry;

  constructor({ registry }: InProcessSimulationRunnerDependencies) {
    this.registry = registry;
  }

  run({
    request,
    onSnapshot,
    stopSignal,
  }: SimulationRunInput): Promise<SimulationOutcome> {
    // Inside the executor, an engine error rejects the promise instead of
    // throwing at the caller, as a Worker's failure would.
    return new Promise((resolve) => {
      if (stopSignal?.aborted) {
        resolve({ status: "stopped" });
        return;
      }
      // Thrown through the engine to unwind it once the signal fires.
      const stop = new Error("The run was stopped.");
      const deliver = stoppableDelivery({ onSnapshot, stopSignal, stop });
      resolve(this.simulate({ request, onSnapshot: deliver }, stop));
    });
  }

  /** Runs to the end, or to the point `onSnapshot` throws `stop`. */
  private simulate(
    { request, onSnapshot }: SimulationRunInput,
    stop: Error,
  ): SimulationOutcome {
    try {
      const input = { ...request, registry: this.registry, onSnapshot };
      return { status: "finished", run: simulateWithMetrics(input) };
    } catch (error) {
      if (error === stop) return { status: "stopped" };
      throw error;
    }
  }
}

interface StoppableDeliveryInput {
  readonly onSnapshot: ((snapshot: MetricsSnapshot) => void) | undefined;
  readonly stopSignal: StopSignal | undefined;
  /** Thrown once the signal has fired. */
  readonly stop: Error;
}

/** Delivers each snapshot, then ends the run if the signal has fired. */
function stoppableDelivery({
  onSnapshot,
  stopSignal,
  stop,
}: StoppableDeliveryInput): (snapshot: MetricsSnapshot) => void {
  return (snapshot) => {
    onSnapshot?.(snapshot);
    if (stopSignal?.aborted) throw stop;
  };
}
