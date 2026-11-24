import type {
  ComponentAsyncFinishedEvent,
  ComponentSample,
  ComponentFinishedEvent,
} from "../engine/simulation-events";
import type { LimitSample, RateLimitSample } from "../engine/simulation-events";
import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import { CauseCounts } from "./cause-counts";
import { LatencyHistogram } from "./latency-histogram";
import type {
  ComponentMetrics,
  LimitUse,
  RateLimitUse,
} from "./metrics-snapshot";

/** A tick's sample for this component, and what's needed to read it. */
export interface ComponentTallySampleInput {
  readonly sample: ComponentSample;
  /** The run's totals before this window, for the running totals' increase. */
  readonly soFar: ComponentTally;
  /** The window's length. */
  readonly windowMs: number;
}

/** A rate limit's running totals since the start; 0 for a concurrency limit. */
interface RateTotals {
  readonly taken: number;
  readonly refused: number;
}

const NO_RATE_TOTALS: RateTotals = { taken: 0, refused: 0 };

/** A limit's sample, and what's needed to turn it into its use in a window. */
interface LimitUseContext {
  /** A rate limit's running totals at the previous tick. */
  readonly before: RateTotals;
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
  readonly asyncFailures = new CauseCounts();
  readonly asyncLatency = new LatencyHistogram();
  gauges: Readonly<Record<string, number>> = {};
  /** Increase per counter in this window. */
  counters: Record<string, number> = {};
  /** Each counter's running total at the latest tick. */
  countersSoFar: Readonly<Record<string, number>> = {};
  limits: readonly LimitUse[] = [];
  /** Each rate limit's running totals at the latest tick, by index. */
  rateSoFar: readonly RateTotals[] = [];

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
  finishAsync({ latencyMs, failure }: ComponentAsyncFinishedEvent): void {
    if (failure !== undefined) {
      this.asyncFailed++;
      this.asyncFailures.record(failure);
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
        before: soFar.rateSoFar[index] ?? NO_RATE_TOTALS,
        windowMs,
      }),
    );
    this.rateSoFar = sample.limits.map(rateTotals);
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
    this.asyncFailures.add(window.asyncFailures);
    this.asyncLatency.merge(window.asyncLatency);
    this.gauges = window.gauges;
    // Over the whole run, the increase is the running total.
    this.countersSoFar = window.countersSoFar;
    this.counters = { ...window.countersSoFar };
    this.limits = window.limits.map((limit, index) =>
      addLimit(limit, this.limits[index]),
    );
    this.rateSoFar = window.rateSoFar;
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
    this.asyncFailures.clear();
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
      asyncFailures: this.asyncFailures.toRecord(),
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
    ({ name, whenFull, limit, inUse, peakInUse }) =>
    () => ({
      kind: "concurrency",
      name,
      whenFull,
      limit,
      current: inUse,
      peak: peakInUse,
    }),
  rate: (sample) => (context) => rateLimitUse(sample, context),
};

function rateLimitUse(
  sample: RateLimitSample,
  { before, windowMs }: LimitUseContext,
): RateLimitUse {
  return {
    kind: "rate",
    name: sample.name,
    whenFull: sample.whenFull,
    limit: sample.burst,
    current: sample.drawnDown,
    peak: sample.peakDrawnDown,
    ratePerSec: sample.ratePerSec,
    takenPerSec: perSecond({ count: sample.taken - before.taken, windowMs }),
    refused: sample.refused - before.refused,
  };
}

/** Input for `perSecond`. */
interface PerSecondInput {
  readonly count: number;
  readonly windowMs: number;
}

function perSecond({ count, windowMs }: PerSecondInput): number {
  if (windowMs <= 0) return 0;
  return (count * 1000) / windowMs;
}

function rateTotals(limit: LimitSample): RateTotals {
  return handleKind(RATE_TOTALS, limit);
}

/** A rate limit's running totals; concurrency limits have none. */
const RATE_TOTALS: KindHandlers<LimitSample, RateTotals> = {
  concurrency: () => NO_RATE_TOTALS,
  rate: ({ taken, refused }) => ({ taken, refused }),
};

/**
 * A window's limit added to the run so far: the highest peak, and for a
 * rate limit, the busiest window's flow and every window's refusals.
 * Everything else is the window's.
 */
function addLimit(window: LimitUse, soFar: LimitUse | undefined): LimitUse {
  if (soFar === undefined) return window;
  const peak = Math.max(window.peak, soFar.peak);
  return { ...handleKind(BUSIEST_FLOW, window)(soFar), peak };
}

/** A rate limit keeps the busiest window's `takenPerSec` and sums `refused`. */
const BUSIEST_FLOW: KindHandlers<LimitUse, (soFar: LimitUse) => LimitUse> = {
  concurrency: (window) => () => window,
  rate: (window) => (soFar) => {
    const before = handleKind(FLOW_SO_FAR, soFar);
    return {
      ...window,
      takenPerSec: Math.max(window.takenPerSec, before.takenPerSec),
      refused: window.refused + before.refused,
    };
  },
};

/** What a rate limit's totals carry over; a concurrency limit carries none. */
type FlowSoFar = Pick<RateLimitUse, "takenPerSec" | "refused">;

const FLOW_SO_FAR: KindHandlers<LimitUse, FlowSoFar> = {
  concurrency: () => ({ takenPerSec: 0, refused: 0 }),
  rate: ({ takenPerSec, refused }) => ({ takenPerSec, refused }),
};
