import type { WorkflowFinishedEvent } from "../engine/simulation-events";
import { CauseCounts } from "./cause-counts";
import { LatencyHistogram } from "./latency-histogram";
import type { WorkflowMetrics } from "./metrics-snapshot";

export class WorkflowTally {
  started = 0;
  succeeded = 0;
  failed = 0;
  readonly failures = new CauseCounts();
  readonly latency = new LatencyHistogram();

  /** Records a user request that got an answer, successful or not. */
  finish({ latencyMs, failure }: WorkflowFinishedEvent): void {
    if (failure !== undefined) {
      this.failed++;
      this.failures.record(failure);
      return;
    }
    this.succeeded++;
    this.latency.record(latencyMs);
  }

  add(window: WorkflowTally): void {
    this.started += window.started;
    this.succeeded += window.succeeded;
    this.failed += window.failed;
    this.failures.add(window.failures);
    this.latency.merge(window.latency);
  }

  reset(): void {
    this.started = 0;
    this.succeeded = 0;
    this.failed = 0;
    this.failures.clear();
    this.latency.reset();
  }

  metrics(): WorkflowMetrics {
    return {
      started: this.started,
      succeeded: this.succeeded,
      failed: this.failed,
      failures: this.failures.toRecord(),
      latency: this.latency.summary(),
    };
  }
}
