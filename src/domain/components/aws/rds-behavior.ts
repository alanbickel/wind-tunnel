import type { ConcurrencyLimit } from "../../behaviors/concurrency-limit";
import type { ServiceTime } from "../../behaviors/service-time";
import type {
  ArriveInput,
  ComponentBehavior,
  Effect,
} from "../component-behavior";

export interface RdsBehaviorDependencies<T> {
  /** `max_connections`; full means rejected. */
  readonly connections: ConcurrencyLimit<T>;
  /** Query workers; full means queued, with an unbounded line. */
  readonly workers: ConcurrencyLimit<T>;
  readonly queryTime: ServiceTime;
}

/** RDS's run-time state: connections, and query workers behind them. */
export class RdsBehavior<T> implements ComponentBehavior<T> {
  private readonly connections: ConcurrencyLimit<T>;
  private readonly workers: ConcurrencyLimit<T>;
  private readonly queryTime: ServiceTime;

  constructor({ connections, workers, queryTime }: RdsBehaviorDependencies<T>) {
    this.connections = connections;
    this.workers = workers;
    this.queryTime = queryTime;
  }

  get inProgress(): number {
    return this.workers.inUse;
  }

  get queueDepth(): number {
    return this.workers.queued;
  }

  /** Running plus waiting queries: each holds a connection. */
  get gauges(): Readonly<Record<string, number>> {
    return { connectionsHeld: this.connections.inUse };
  }

  arrive({ request }: ArriveInput<T>): Effect<T>[] {
    if (this.connections.acquire(request) === "rejected") {
      return [{ kind: "rejected", request, reason: "too-many-connections" }];
    }
    // The worker line is unbounded, so the query runs now or waits.
    if (this.workers.acquire(request) !== "admitted") {
      return [{ kind: "queued", request }];
    }
    return [this.start(request)];
  }

  finish(): Effect<T>[] {
    this.connections.release();
    const next = this.workers.release();
    if (next === undefined) return [];
    return [this.start(next)];
  }

  private start(request: T): Effect<T> {
    return { kind: "started", request, serviceMs: this.queryTime.next() };
  }
}
