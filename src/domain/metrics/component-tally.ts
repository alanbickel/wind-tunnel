import type {
  AsyncFinishedEvent,
  ComponentSample,
  FinishedEvent,
} from "../engine/simulation-events";
import { LatencyHistogram } from "./latency-histogram";
import type { ComponentMetrics } from "./metrics-snapshot";

export class ComponentTally {
  arrivals = 0;
  completed = 0;
  failed = 0;
  rejected = 0;
  timeouts = 0;
  readonly latency = new LatencyHistogram();
  inProgress = 0;
  queueDepth = 0;
  peakInProgress = 0;
  peakQueueDepth = 0;
  asyncSucceeded = 0;
  asyncFailed = 0;
  readonly asyncLatency = new LatencyHistogram();
  gauges: Readonly<Record<string, number>> = {};
  /** Increase per counter in this window. */
  counters: Record<string, number> = {};
  /** Each counter's running total at the latest tick. */
  countersSoFar: Readonly<Record<string, number>> = {};

  /** Records work that finished here, successfully or not. */
  finish({ latencyMs, failure }: FinishedEvent): void {
    if (failure !== undefined) {
      this.failed++;
      return;
    }
    this.completed++;
    this.latency.record(latencyMs);
  }

  /** Records a delivery of async work that ended. */
  finishAsync({ latencyMs, succeeded }: AsyncFinishedEvent): void {
    if (!succeeded) {
      this.asyncFailed++;
      return;
    }
    this.asyncSucceeded++;
    this.asyncLatency.record(latencyMs);
  }

  /** Records a tick's sample; `before` holds the counters at the last tick. */
  sample(sample: ComponentSample, before: Readonly<Record<string, number>>) {
    this.inProgress = sample.inProgress;
    this.queueDepth = sample.queueDepth;
    this.peakInProgress = sample.peakInProgress;
    this.peakQueueDepth = sample.peakQueueDepth;
    this.gauges = sample.gauges;
    this.countersSoFar = sample.counters;
    this.counters = {};
    for (const [name, value] of Object.entries(sample.counters)) {
      this.counters[name] = value - (before[name] ?? 0);
    }
  }

  /** Adds a finished window into these run totals. */
  add(window: ComponentTally): void {
    this.arrivals += window.arrivals;
    this.completed += window.completed;
    this.failed += window.failed;
    this.rejected += window.rejected;
    this.timeouts += window.timeouts;
    this.latency.merge(window.latency);
    this.inProgress = window.inProgress;
    this.queueDepth = window.queueDepth;
    this.peakInProgress = Math.max(this.peakInProgress, window.peakInProgress);
    this.peakQueueDepth = Math.max(this.peakQueueDepth, window.peakQueueDepth);
    this.asyncSucceeded += window.asyncSucceeded;
    this.asyncFailed += window.asyncFailed;
    this.asyncLatency.merge(window.asyncLatency);
    this.gauges = window.gauges;
    // Over the whole run, the increase is the running total.
    this.countersSoFar = window.countersSoFar;
    this.counters = { ...window.countersSoFar };
  }

  reset(): void {
    this.arrivals = 0;
    this.completed = 0;
    this.failed = 0;
    this.rejected = 0;
    this.timeouts = 0;
    this.latency.reset();
    this.asyncSucceeded = 0;
    this.asyncFailed = 0;
    this.asyncLatency.reset();
  }

  metrics(): ComponentMetrics {
    return {
      arrivals: this.arrivals,
      completed: this.completed,
      failed: this.failed,
      rejected: this.rejected,
      timeouts: this.timeouts,
      latency: this.latency.summary(),
      inProgress: this.inProgress,
      queueDepth: this.queueDepth,
      peakInProgress: this.peakInProgress,
      peakQueueDepth: this.peakQueueDepth,
      asyncSucceeded: this.asyncSucceeded,
      asyncFailed: this.asyncFailed,
      asyncLatency: this.asyncLatency.summary(),
      gauges: this.gauges,
      counters: { ...this.counters },
    };
  }
}
