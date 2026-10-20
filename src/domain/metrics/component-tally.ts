import type {
  ComponentAsyncFinishedEvent,
  ComponentSample,
  ComponentFinishedEvent,
} from "../engine/simulation-events";
import type { LimitSample } from "../engine/simulation-events";
import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import { LatencyHistogram } from "./latency-histogram";
import type { ComponentMetrics, LimitUse } from "./metrics-snapshot";

/** A tick's sample for this component, and what's needed to read it. */
export interface ComponentTallySampleInput {
  readonly sample: ComponentSample;
  /** The run's totals before this window, for the running totals' increase. */
  readonly soFar: ComponentTally;
  /** The window's length. */
  readonly windowMs: number;
}

/** A limit's sample, and what's needed to turn it into its use in a window. */
interface LimitUseContext {
  /** A rate limit's tokens taken since the start, at the previous tick. */
  readonly takenBefore: number;
  readonly windowMs: number;
}

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
  limits: readonly LimitUse[] = [];
  /** Each rate limit's tokens taken at the latest tick, by index; 0 otherwise. */
  takenSoFar: readonly number[] = [];

  /** Records work that finished here, successfully or not. */
  finish({ latencyMs, failure }: ComponentFinishedEvent): void {
    if (failure !== undefined) {
      this.failed++;
      return;
    }
    this.completed++;
    this.latency.record(latencyMs);
  }

  /** Records a delivery of async work that ended. */
  finishAsync({ latencyMs, succeeded }: ComponentAsyncFinishedEvent): void {
    if (!succeeded) {
      this.asyncFailed++;
      return;
    }
    this.asyncSucceeded++;
    this.asyncLatency.record(latencyMs);
  }

  /** Records a tick's sample at the end of this window. */
  sample({ sample, soFar, windowMs }: ComponentTallySampleInput): void {
    const before = soFar.countersSoFar;
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
    this.limits = sample.limits.map((limit, index) =>
      handleKind(
        LIMIT_USES,
        limit,
      )({
        takenBefore: soFar.takenSoFar[index] ?? 0,
        windowMs,
      }),
    );
    this.takenSoFar = sample.limits.map(takenSoFar);
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
    this.limits = window.limits.map((limit, index) =>
      withPeak(limit, this.limits[index]?.peak ?? 0),
    );
    this.takenSoFar = window.takenSoFar;
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
      limits: this.limits,
    };
  }
}

/** A limit's use in the window that a tick closes. */
const LIMIT_USES: KindHandlers<
  LimitSample,
  (context: LimitUseContext) => LimitUse
> = {
  concurrency:
    ({ name, limit, inUse, peakInUse }) =>
    () => ({
      kind: "concurrency",
      name,
      limit,
      current: inUse,
      peak: peakInUse,
    }),
  rate:
    ({ name, ratePerSec, burst, taken }) =>
    ({ takenBefore, windowMs }) => {
      const perSec = perSecond({ count: taken - takenBefore, windowMs });
      return {
        kind: "rate",
        name,
        limit: ratePerSec,
        burst,
        current: perSec,
        peak: perSec,
      };
    },
};

/** Input for `perSecond`. */
interface PerSecondInput {
  readonly count: number;
  readonly windowMs: number;
}

function perSecond({ count, windowMs }: PerSecondInput): number {
  if (windowMs <= 0) return 0;
  return (count * 1000) / windowMs;
}

function takenSoFar(limit: LimitSample): number {
  return handleKind(TAKEN_SO_FAR, limit);
}

/** A rate limit's running total of tokens taken; concurrency limits have none. */
const TAKEN_SO_FAR: KindHandlers<LimitSample, number> = {
  concurrency: () => 0,
  rate: ({ taken }) => taken,
};

/** The limit with its peak raised to `earlierPeak` if that was higher. */
function withPeak(limit: LimitUse, earlierPeak: number): LimitUse {
  return { ...limit, peak: Math.max(limit.peak, earlierPeak) };
}
