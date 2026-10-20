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

  trackPeaks(component: RuntimeComponent): void {
    const { behavior } = component;
    component.peakInProgress = Math.max(
      component.peakInProgress,
      behavior.inProgress,
    );
    component.peakQueueDepth = Math.max(
      component.peakQueueDepth,
      behavior.queueDepth,
    );
    trackLimitPeaks(component);
  }

  private tick(timeMs: number): void {
    const components = [...this.topology.allComponents()].map(
      sampleAndResetPeaks,
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
function sampleAndResetPeaks(component: RuntimeComponent): ComponentSample {
  const { behavior } = component;
  const sample: ComponentSample = {
    componentId: component.id,
    inProgress: behavior.inProgress,
    queueDepth: behavior.queueDepth,
    peakInProgress: component.peakInProgress,
    peakQueueDepth: component.peakQueueDepth,
    gauges: { ...behavior.gauges },
    counters: { ...behavior.counters },
    limits: sampleLimits(component),
  };
  component.peakInProgress = behavior.inProgress;
  component.peakQueueDepth = behavior.queueDepth;
  resetLimitPeaks(component);
  return sample;
}

/** Raises each concurrency limit's peak to its current use. */
function trackLimitPeaks({ behavior, limitPeaks }: RuntimeComponent): void {
  const limits = behavior.limits ?? [];
  for (const [index, gauge] of limits.entries()) {
    if (gauge.kind !== "concurrency") continue;
    limitPeaks[index] = Math.max(limitPeaks[index] ?? 0, gauge.inUse);
  }
}

/** Each concurrency limit's peak starts again from its current use. */
function resetLimitPeaks({ behavior, limitPeaks }: RuntimeComponent): void {
  const limits = behavior.limits ?? [];
  for (const [index, gauge] of limits.entries()) {
    if (gauge.kind !== "concurrency") continue;
    limitPeaks[index] = gauge.inUse;
  }
}

/** A copy of each limit's values now, with its peak since the last tick. */
function sampleLimits({
  behavior,
  limitPeaks,
}: RuntimeComponent): LimitSample[] {
  return (behavior.limits ?? []).map((gauge, index) =>
    handleKind(LIMIT_SAMPLES, gauge)(limitPeaks[index] ?? 0),
  );
}

/** Copies a live limit view into a sample, given its tracked peak. */
const LIMIT_SAMPLES: KindHandlers<LimitGauge, (peak: number) => LimitSample> = {
  concurrency:
    ({ name, limit, inUse }) =>
    (peak) => ({
      kind: "concurrency",
      name,
      limit,
      inUse,
      peakInUse: Math.max(peak, inUse),
    }),
  rate:
    ({ name, ratePerSec, burst, taken }) =>
    () => ({ kind: "rate", name, ratePerSec, burst, taken }),
};
