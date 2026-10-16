import type {
  Failure,
  WorkflowFinishedEvent,
} from "../engine/simulation-events";
import { LatencyHistogram } from "./latency-histogram";
import type { WorkflowMetrics } from "./metrics-snapshot";

export class WorkflowTally {
  started = 0;
  succeeded = 0;
  failed = 0;
  readonly failures = new Map<string, number>();
  readonly latency = new LatencyHistogram();

  /** Records a user request that got an answer, successful or not. */
  finish({ latencyMs, failure }: WorkflowFinishedEvent): void {
    if (failure !== undefined) {
      this.fail(failure);
      return;
    }
    this.succeeded++;
    this.latency.record(latencyMs);
  }

  add(window: WorkflowTally): void {
    this.started += window.started;
    this.succeeded += window.succeeded;
    this.failed += window.failed;
    for (const [cause, count] of window.failures) {
      this.failures.set(cause, (this.failures.get(cause) ?? 0) + count);
    }
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
      failures: Object.fromEntries(this.failures),
      latency: this.latency.summary(),
    };
  }

  private fail(failure: Failure): void {
    this.failed++;
    const cause = `${failure.componentId}: ${failure.reason}`;
    this.failures.set(cause, (this.failures.get(cause) ?? 0) + 1);
  }
}
