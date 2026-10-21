import type { LimitGauge } from "../components/component-behavior";
import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import type { RuntimeComponent } from "./runtime-records";
import type {
  ComponentSample,
  LimitSample,
  MetricsTickEvent,
} from "./simulation-events";
import type { TickSampler } from "./tick-sampler";
import type { Topology } from "./topology";

export interface IntervalTickSamplerDependencies {
  readonly topology: Topology;
  readonly observe: (event: MetricsTickEvent) => void;
  /** Report a tick every `tickMs`; must be positive. */
  readonly tickMs: number;
  readonly untilMs: number;
}

/** A `TickSampler` that reports every `tickMs`, plus once at the end. */
export class IntervalTickSampler implements TickSampler {
  private readonly topology: Topology;
  private readonly observe: (event: MetricsTickEvent) => void;
  private readonly tickMs: number;
  private readonly untilMs: number;
  private nextTickMs: number;

  constructor(dependencies: IntervalTickSamplerDependencies) {
    this.topology = dependencies.topology;
    this.observe = dependencies.observe;
    this.tickMs = checkTickMs(dependencies.tickMs);
    this.untilMs = dependencies.untilMs;
    this.nextTickMs = this.tickMs;
  }

  ticksBefore(timeMs: number): void {
    while (this.nextTickMs <= timeMs && this.nextTickMs < this.untilMs) {
      this.tick(this.nextTickMs);
      this.nextTickMs += this.tickMs;
    }
  }

  finalTick(): void {
    this.ticksBefore(this.untilMs);
    if (this.untilMs <= 0) return;
    this.tick(this.untilMs);
  }

  trackPeaks(component: RuntimeComponent, nowMs: number): void {
    const { behavior } = component;
    component.peakInProgress = Math.max(
      component.peakInProgress,
      behavior.inProgress,
    );
    component.peakQueueDepth = Math.max(
      component.peakQueueDepth,
      behavior.queueDepth,
    );
    trackLimitPeaks({ component, nowMs });
  }

  private tick(timeMs: number): void {
    const components = [...this.topology.allComponents()].map((component) =>
      sampleAndResetPeaks({ component, nowMs: timeMs }),
    );
    this.observe({ kind: "metrics-tick", timeMs, components });
  }
}

function checkTickMs(tickMs: number): number {
  if (!(tickMs > 0)) {
    throw new Error(`tickMs must be positive, got ${String(tickMs)}`);
  }
  return tickMs;
}

/** The component's state for a tick; its peaks start again from now. */
function sampleAndResetPeaks(input: LimitReadInput): ComponentSample {
  const { component } = input;
  const { behavior } = component;
  const sample: ComponentSample = {
    componentId: component.id,
    inProgress: behavior.inProgress,
    queueDepth: behavior.queueDepth,
    peakInProgress: component.peakInProgress,
    peakQueueDepth: component.peakQueueDepth,
    gauges: { ...behavior.gauges },
    counters: { ...behavior.counters },
    limits: sampleLimits(input),
  };
  component.peakInProgress = behavior.inProgress;
  component.peakQueueDepth = behavior.queueDepth;
  resetLimitPeaks(input);
  return sample;
}

/** A component whose limits are read at `nowMs`. */
interface LimitReadInput {
  readonly component: RuntimeComponent;
  readonly nowMs: number;
}

/** Raises each limit's peak to its use now. */
function trackLimitPeaks({ component, nowMs }: LimitReadInput): void {
  const { behavior, limitPeaks } = component;
  for (const [index, gauge] of (behavior.limits ?? []).entries()) {
    const use = handleKind(USE_AT, gauge)(nowMs);
    limitPeaks[index] = Math.max(limitPeaks[index] ?? 0, use);
  }
}

/** Each limit's peak starts again from its use now. */
function resetLimitPeaks({ component, nowMs }: LimitReadInput): void {
  const { behavior, limitPeaks } = component;
  for (const [index, gauge] of (behavior.limits ?? []).entries()) {
    limitPeaks[index] = handleKind(USE_AT, gauge)(nowMs);
  }
}

/**
 * How much of a limit is used at a time: slots held, or tokens drawn out of
 * a full bucket. A full bucket is 0; an empty one is its burst.
 */
const USE_AT: KindHandlers<LimitGauge, (nowMs: number) => number> = {
  concurrency: (gauge) => () => gauge.inUse,
  rate: (gauge) => (nowMs) => gauge.burst - gauge.tokensLeft(nowMs),
};

/** A copy of each limit's values now, with its peak since the last tick. */
function sampleLimits({ component, nowMs }: LimitReadInput): LimitSample[] {
  const { behavior, limitPeaks } = component;
  return (behavior.limits ?? []).map((gauge, index) => {
    const use = handleKind(USE_AT, gauge)(nowMs);
    const peak = Math.max(limitPeaks[index] ?? 0, use);
    return handleKind(LIMIT_SAMPLES, gauge)({ use, peak });
  });
}

/** A limit's use at a tick, and its highest since the previous tick. */
interface LimitUseNow {
  readonly use: number;
  readonly peak: number;
}

/** Copies a live limit view into a sample. */
const LIMIT_SAMPLES: KindHandlers<
  LimitGauge,
  (now: LimitUseNow) => LimitSample
> = {
  concurrency:
    ({ name, whenFull, limit }) =>
    ({ use, peak }) => ({
      kind: "concurrency",
      name,
      whenFull,
      limit,
      inUse: use,
      peakInUse: peak,
    }),
  rate:
    ({ name, whenFull, ratePerSec, burst, taken }) =>
    ({ use, peak }) => ({
      kind: "rate",
      name,
      whenFull,
      ratePerSec,
      burst,
      taken,
      drawnDown: use,
      peakDrawnDown: peak,
    }),
};
