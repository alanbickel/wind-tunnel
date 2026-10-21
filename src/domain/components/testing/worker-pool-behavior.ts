import type {
  AcquireResult,
  ConcurrencyLimit,
} from "../../behaviors/concurrency-limit";
import type { ServiceTime } from "../../behaviors/service-time";
import { lookup } from "../../shared/kind-handlers";
import type {
  ArriveInput,
  ComponentBehavior,
  Effect,
  LimitGauge,
  RefuseWhenFull,
  WaitWhenFull,
} from "../component-behavior";
import { concurrencyGauge } from "../limit-gauges";

/** A request waits for a worker, keeping its place in the wait line. */
const WAIT_IN_LINE: WaitWhenFull = { kind: "wait", holds: "waitLine" };

/** Rejects a request that finds the wait line full. */
export const QUEUE_FULL: RefuseWhenFull = {
  kind: "refuse",
  reason: "queue-full",
};

export interface WorkerPoolBehaviorDependencies<T> {
  /** Workers, with a wait line; a full line rejects. */
  readonly workers: ConcurrencyLimit<T>;
  /** Places in the wait line; `Infinity` if it's unbounded. */
  readonly waitLineCapacity: number;
  readonly serviceTime: ServiceTime;
}

/**
 * N workers with a wait line in front: ConcurrencyLimit (queue) →
 * ServiceTime. Its limits mirror RDS's: `workers` makes requests wait, and
 * each waiting request holds a place in the `waitLine`, which refuses.
 */
export class WorkerPoolBehavior<T> implements ComponentBehavior<T> {
  readonly limits: readonly LimitGauge[];
  private readonly workers: ConcurrencyLimit<T>;
  private readonly serviceTime: ServiceTime;

  /** What an arrival gets, by what the worker limit said. */
  private readonly outcomes: Readonly<
    Record<AcquireResult, (request: T) => Effect<T>>
  > = {
    admitted: (request) => this.start(request),
    queued: (request) => ({ kind: "queued", request }),
    rejected: (request) => ({
      kind: "rejected",
      request,
      reason: QUEUE_FULL.reason,
    }),
  };

  constructor({
    workers,
    waitLineCapacity,
    serviceTime,
  }: WorkerPoolBehaviorDependencies<T>) {
    this.workers = workers;
    this.serviceTime = serviceTime;
    this.limits = [
      concurrencyGauge({
        name: "workers",
        whenFull: WAIT_IN_LINE,
        source: workers,
      }),
      concurrencyGauge({
        name: "waitLine",
        whenFull: QUEUE_FULL,
        source: {
          limit: waitLineCapacity,
          get inUse() {
            return workers.queued;
          },
        },
      }),
    ];
  }

  get inProgress(): number {
    return this.workers.inUse;
  }

  get queueDepth(): number {
    return this.workers.queued;
  }

  arrive({ request }: ArriveInput<T>): Effect<T>[] {
    const outcome = lookup(this.outcomes, this.workers.acquire(request));
    return [outcome(request)];
  }

  finish(): Effect<T>[] {
    const next = this.workers.release();
    if (next === undefined) return [];
    return [this.start(next)];
  }

  private start(request: T): Effect<T> {
    return { kind: "started", request, serviceMs: this.serviceTime.next() };
  }
}
