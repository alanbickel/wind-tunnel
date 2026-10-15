/* eslint-disable max-classes-per-file -- the tallies move to their own files in R2.7 */
import type {
  AsyncFinishedEvent,
  AttemptFailedEvent,
  ComponentSample,
  Failure,
  FinishedEvent,
  SimulationEvent,
  SimulationInput,
  WorkflowFinishedEvent,
} from "../engine/simulation-events";
import { simulate } from "../engine/simulation";
import type { Project } from "../model/project";
import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import { LatencyHistogram, type LatencySummary } from "./latency-histogram";

/** For events that don't change any metric. */
const ignore = (): void => undefined;

/** One component's activity over a window of simulated time. */
export interface ComponentMetrics {
  readonly arrivals: number;
  /** Work that finished successfully, including its nested calls. */
  readonly completed: number;
  /** Work that finished because a nested call failed. */
  readonly failed: number;
  readonly rejected: number;
  /** Callers that gave up waiting on this component. */
  readonly timeouts: number;
  /** Time from arrival to finish of `completed` work. */
  readonly latency: LatencySummary | undefined;
  /** At the window's end. */
  readonly inProgress: number;
  readonly queueDepth: number;
  /** Highest during the window. */
  readonly peakInProgress: number;
  readonly peakQueueDepth: number;
  /** Queue-like components: deliveries of async work that ended. */
  readonly asyncSucceeded: number;
  readonly asyncFailed: number;
  /** Time from the user's request to the end of a successful delivery. */
  readonly asyncLatency: LatencySummary | undefined;
  /** Type-specific values at the window's end, e.g. RDS `connectionsHeld`. */
  readonly gauges: Readonly<Record<string, number>>;
  /** Type-specific counts during the window, e.g. Lambda `coldStarts`. */
  readonly counters: Readonly<Record<string, number>>;
}

/** One workflow's user requests that got an answer during a window. */
export interface WorkflowMetrics {
  readonly started: number;
  readonly succeeded: number;
  readonly failed: number;
  /** Failed requests by cause, e.g. `"orders-db: too-many-connections"`. */
  readonly failures: Readonly<Record<string, number>>;
  /** End-to-end latency of `succeeded` requests. */
  readonly latency: LatencySummary | undefined;
}

/**
 * Metrics for a window of simulated time, `[startMs, endMs)`. The last
 * window of a run also includes events at exactly `endMs`.
 */
export interface MetricsSnapshot {
  readonly startMs: number;
  readonly endMs: number;
  /** Keyed by component ID, in architecture order. */
  readonly components: Readonly<Record<string, ComponentMetrics>>;
  /** Keyed by workflow ID. */
  readonly workflows: Readonly<Record<string, WorkflowMetrics>>;
}

/**
 * Turns a run's `SimulationEvent`s into a `MetricsSnapshot` per tick, plus
 * totals for the whole run (MVP design §4.3). Pass `observe` as the
 * simulation's observer and set its `tickMs`; `simulateWithMetrics` does both.
 */
export class MetricsCollector {
  readonly snapshots: MetricsSnapshot[] = [];
  private readonly window: Tally;
  private readonly total: Tally;
  private readonly onSnapshot: (snapshot: MetricsSnapshot) => void;
  /** Edge ID to the component it calls, to tell where a timeout happened. */
  private readonly edgeTargets = new Map<string, string>();
  private windowStartMs = 0;

  constructor(
    project: Project,
    onSnapshot: (snapshot: MetricsSnapshot) => void = () => undefined,
  ) {
    const componentIds = project.architecture.components.map((c) => c.id);
    const workflowIds = project.workflows.map((w) => w.id);
    this.window = new Tally(componentIds, workflowIds);
    this.total = new Tally(componentIds, workflowIds);
    for (const edge of project.architecture.edges) {
      this.edgeTargets.set(edge.id, edge.to);
    }
    this.onSnapshot = onSnapshot;
  }

  /** The observer to pass to `simulate`. */
  readonly observe = (event: SimulationEvent): void => {
    handleKind(this.eventHandlers, event);
  };

  /** Metrics for the whole run so far, as one window from the start. */
  totals(): MetricsSnapshot {
    return this.total.snapshot(0, this.windowStartMs);
  }

  /** What each kind of event adds to the current window. */
  private readonly eventHandlers: KindHandlers<SimulationEvent, void> = {
    "workflow-started": ({ workflowId }) => {
      this.window.workflow(workflowId).started++;
    },
    "workflow-finished": (event) => {
      this.window.workflow(event.workflowId).finish(event);
    },
    arrived: ({ componentId }) => {
      this.window.component(componentId).arrivals++;
    },
    rejected: ({ componentId }) => {
      this.window.component(componentId).rejected++;
    },
    finished: (event) => {
      this.window.component(event.componentId).finish(event);
    },
    "attempt-failed": (event) => {
      this.countTimeout(event);
    },
    "async-finished": (event) => {
      this.window.component(event.componentId).finishAsync(event);
    },
    tick: ({ timeMs, components }) => {
      this.tick(timeMs, components);
    },
    queued: ignore,
    started: ignore,
    dispatched: ignore,
  };

  /**
   * A timeout also fails each caller further up the chain; count it only on
   * the edge where it happened, against the component called.
   */
  private countTimeout({ edgeId, failure }: AttemptFailedEvent): void {
    if (failure.reason !== "timeout") return;
    if (this.edgeTargets.get(edgeId) !== failure.componentId) return;
    this.window.component(failure.componentId).timeouts++;
  }

  private tick(timeMs: number, samples: readonly ComponentSample[]): void {
    for (const sample of samples) {
      const component = this.window.component(sample.componentId);
      const last = this.total.component(sample.componentId).countersSoFar;
      component.sample(sample, last);
    }
    const snapshot = this.window.snapshot(this.windowStartMs, timeMs);
    this.total.add(this.window);
    this.window.reset();
    this.windowStartMs = timeMs;
    this.snapshots.push(snapshot);
    this.onSnapshot(snapshot);
  }
}

export interface MetricsRun {
  readonly eventsProcessed: number;
  readonly snapshots: readonly MetricsSnapshot[];
  readonly totals: MetricsSnapshot;
}

export interface MetricsSimulationInput extends SimulationInput {
  /** Gets each snapshot as soon as its tick closes, before the run ends. */
  readonly onSnapshot?: (snapshot: MetricsSnapshot) => void;
}

/**
 * Runs `simulate` with a `MetricsCollector` attached. Ticks every simulated
 * second unless `tickMs` says otherwise.
 */
export function simulateWithMetrics(input: MetricsSimulationInput): MetricsRun {
  const { onSnapshot, observer, ...rest } = input;
  const collector = new MetricsCollector(input.project, onSnapshot);
  const { eventsProcessed } = simulate({
    ...rest,
    tickMs: input.tickMs ?? 1_000,
    observer: (event) => {
      collector.observe(event);
      observer?.(event);
    },
  });
  return {
    eventsProcessed,
    snapshots: collector.snapshots,
    totals: collector.totals(),
  };
}

class ComponentTally {
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

class WorkflowTally {
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

/** Running counts for every component and workflow. */
class Tally {
  private readonly components = new Map<string, ComponentTally>();
  private readonly workflows = new Map<string, WorkflowTally>();

  constructor(componentIds: string[], workflowIds: string[]) {
    for (const id of componentIds) this.component(id);
    for (const id of workflowIds) this.workflow(id);
  }

  component(id: string): ComponentTally {
    let tally = this.components.get(id);
    if (tally === undefined) {
      tally = new ComponentTally();
      this.components.set(id, tally);
    }
    return tally;
  }

  workflow(id: string): WorkflowTally {
    let tally = this.workflows.get(id);
    if (tally === undefined) {
      tally = new WorkflowTally();
      this.workflows.set(id, tally);
    }
    return tally;
  }

  add(window: Tally): void {
    for (const [id, tally] of window.components) this.component(id).add(tally);
    for (const [id, tally] of window.workflows) this.workflow(id).add(tally);
  }

  reset(): void {
    for (const tally of this.components.values()) tally.reset();
    for (const tally of this.workflows.values()) tally.reset();
  }

  snapshot(startMs: number, endMs: number): MetricsSnapshot {
    const components: Record<string, ComponentMetrics> = {};
    for (const [id, tally] of this.components) components[id] = tally.metrics();
    const workflows: Record<string, WorkflowMetrics> = {};
    for (const [id, tally] of this.workflows) workflows[id] = tally.metrics();
    return { startMs, endMs, components, workflows };
  }
}
