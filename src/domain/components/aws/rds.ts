import { z } from "zod";
import { CountingSemaphore } from "../../behaviors/counting-semaphore";
import { SampledServiceTime } from "../../behaviors/sampled-service-time";
import { distributionSchema } from "../../random/distribution";
import type { ComponentBehavior } from "../component-behavior";
import type {
  BuildContext,
  ComponentDefinition,
} from "../component-definition";
import { RdsBehavior, TOO_MANY_CONNECTIONS } from "./rds-behavior";

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
  rejectionReasons: [TOO_MANY_CONNECTIONS.reason],
  build<T>(config: RdsConfig, { random }: BuildContext): ComponentBehavior<T> {
    return new RdsBehavior<T>({
      connections: new CountingSemaphore<T>({
        limit: config.maxConnections,
        whenFull: "reject",
      }),
      workers: new CountingSemaphore<T>({
        limit: config.queryWorkers,
        whenFull: "queue",
      }),
      queryTime: new SampledServiceTime(config.queryTime, random),
    });
  },
};
