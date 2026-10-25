import { act } from "@testing-library/react";
import type {
  SimulationOutcome,
  SimulationRunInput,
  SimulationRunner,
} from "../../../application/ports/simulation-runner";
import { sampleSnapshot } from "../../../application/testing/sample-snapshots";
import type { MetricsSnapshot } from "../../../domain/metrics/metrics-snapshot";

/**
 * A runner the test drives: each run waits until the test sends snapshots
 * and ends it, or the stop signal fires.
 */
export class ManualSimulationRunner implements SimulationRunner {
  private input: SimulationRunInput | undefined;
  private settle: ((outcome: SimulationOutcome) => void) | undefined;
  private fail: ((error: Error) => void) | undefined;
  runs = 0;

  run(input: SimulationRunInput): Promise<SimulationOutcome> {
    this.runs += 1;
    this.input = input;
    return new Promise((resolve, reject) => {
      this.settle = resolve;
      this.fail = reject;
      input.stopSignal?.addEventListener("abort", () => {
        resolve({ status: "stopped" });
      });
    });
  }

  get stopped(): boolean {
    return this.input?.stopSignal?.aborted ?? false;
  }

  send(snapshot: MetricsSnapshot): void {
    act(() => {
      this.input?.onSnapshot?.(snapshot);
    });
  }

  async finish(): Promise<void> {
    await act(async () => {
      this.settle?.({
        status: "finished",
        run: {
          eventsProcessed: 0,
          snapshots: [],
          totals: sampleSnapshot({ second: 1 }),
        },
      });
      await Promise.resolve();
    });
  }

  async crash(message: string): Promise<void> {
    await act(async () => {
      this.fail?.(new Error(message));
      await Promise.resolve();
    });
  }
}
