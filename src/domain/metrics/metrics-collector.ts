import type {
  ComponentSample,
  EdgeAttemptFailedEvent,
  SimulationEvent,
  SimulationInput,
} from "../engine/simulation-events";
import { simulate } from "../engine/create-simulation";
import type { Project } from "../model/project";
import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import type { MetricsSnapshot } from "./metrics-snapshot";
import { Tally } from "./tally";

export type {
  ComponentMetrics,
  ConcurrencyLimitUse,
  LimitUse,
  MetricsSnapshot,
  RateLimitUse,
  WorkflowMetrics,
} from "./metrics-snapshot";

/** For events that don't change any metric. */
const ignore = (): void => undefined;

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
    "component-arrived": ({ componentId }) => {
      this.window.component(componentId).arrivals++;
    },
    "component-rejected": ({ componentId }) => {
      this.window.component(componentId).rejected++;
    },
    "component-finished": (event) => {
      this.window.component(event.componentId).finish(event);
    },
    "edge-attempt-failed": (event) => {
      this.countTimeout(event);
    },
    "component-async-finished": (event) => {
      this.window.component(event.componentId).finishAsync(event);
    },
    "metrics-tick": ({ timeMs, components }) => {
      this.tick(timeMs, components);
    },
    "component-queued": ignore,
    "component-started": ignore,
    "component-dispatched": ignore,
  };

  /**
   * A timeout also fails each caller further up the chain; count it only on
   * the edge where it happened, against the component called.
   */
  private countTimeout({ edgeId, failure }: EdgeAttemptFailedEvent): void {
    if (failure.reason !== "timeout") return;
    if (this.edgeTargets.get(edgeId) !== failure.componentId) return;
    this.window.component(failure.componentId).timeouts++;
  }

  private tick(timeMs: number, samples: readonly ComponentSample[]): void {
    const windowMs = timeMs - this.windowStartMs;
    for (const sample of samples) {
      this.window.component(sample.componentId).sample({
        sample,
        soFar: this.total.component(sample.componentId),
        windowMs,
      });
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
