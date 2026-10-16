import { z } from "zod";
import type { ConcurrencyLimit } from "../../behaviors/concurrency-limit";
import { CountingSemaphore } from "../../behaviors/counting-semaphore";
import { SampledServiceTime } from "../../behaviors/sampled-service-time";
import type { ServiceTime } from "../../behaviors/service-time";
import { distributionSchema } from "../../random/distribution";
import type {
  ArriveInput,
  ComponentBehavior,
  Effect,
} from "../component-behavior";
import type {
  BuildContext,
  ComponentDefinition,
} from "../component-definition";

const rdsConfig = z.object({
  /** The database's `max_connections`. Beyond it, connecting fails. */
  maxConnections: z.number().int().min(1),
  /**
   * Queries the database can run at once, standing in for its CPU. Extra
   * queries wait for a worker while holding their connection.
   */
  queryWorkers: z.number().int().min(1),
  queryTime: distributionSchema,
});
export type RdsConfig = z.infer<typeof rdsConfig>;

/**
 * Amazon RDS (MVP design §3.2), with two limits on purpose:
 *
 * 1. Connections: a request that can't get one is rejected
 *    (`too-many-connections`).
 * 2. Query workers: a connected request waits in line for one.
 *
 * When queries arrive faster than the workers finish them, the line grows,
 * each connection is held longer, and the connection limit is eventually hit.
 * That feedback loop is Template A's lesson.
 *
 * A connection is held for one query (wait plus run). In real Lambda it's
 * usually held for the life of the execution environment (fidelity LMB-8);
 * see docs/design/fidelity.md for this and the other RDS simplifications.
 */
export const rdsDefinition: ComponentDefinition<RdsConfig> = {
  type: "rds",
  displayName: "RDS",
  configSchema: rdsConfig,
  defaultConfig: {
    maxConnections: 90,
    queryWorkers: 16,
    queryTime: { kind: "lognormal", medianMs: 15, p99Ms: 60 },
  },
  actions: ["read", "write"],
  deliversAsync: false,
  build<T>(config: RdsConfig, context: BuildContext): ComponentBehavior<T> {
    return new RdsBehavior<T>(config, context);
  },
};

/** RDS's run-time state: connections, and query workers behind them. */
class RdsBehavior<T> implements ComponentBehavior<T> {
  private readonly connections: ConcurrencyLimit<T>;
  private readonly workers: ConcurrencyLimit<T>;
  private readonly queryTime: ServiceTime;

  constructor(config: RdsConfig, { random }: BuildContext) {
    // eslint-disable-next-line no-restricted-syntax -- moves to a factory in R2.8 (ADR-0009)
    this.connections = new CountingSemaphore<T>({
      limit: config.maxConnections,
      whenFull: "reject",
    });
    // eslint-disable-next-line no-restricted-syntax -- moves to a factory in R2.8 (ADR-0009)
    this.workers = new CountingSemaphore<T>({
      limit: config.queryWorkers,
      whenFull: "queue",
    });
    // eslint-disable-next-line no-restricted-syntax -- moves to a factory in R2.8 (ADR-0009)
    this.queryTime = new SampledServiceTime(config.queryTime, random);
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
