import { z } from "zod";
import { RateLimit } from "../../behaviors/rate-limit";
import { ServiceTime } from "../../behaviors/service-time";
import { distributionSchema } from "../../random/distribution";
import type { ComponentBehavior } from "../component-behavior";
import type {
  BuildContext,
  ComponentDefinition,
} from "../component-definition";

const dynamoDbConfig = z.object({
  /** Provisioned read capacity units per second; each read uses one. */
  readUnitsPerSec: z.number().positive(),
  /** Provisioned write capacity units per second; each write uses one. */
  writeUnitsPerSec: z.number().positive(),
  /**
   * Seconds of unused capacity the table can save up and spend in a burst.
   * AWS keeps up to 300 seconds' worth, but doesn't guarantee it.
   */
  burstSec: z.number().nonnegative(),
  latency: distributionSchema,
});
export type DynamoDbConfig = z.infer<typeof dynamoDbConfig>;

/**
 * Amazon DynamoDB with provisioned capacity (MVP design §3.2): one token
 * bucket for reads and one for writes, then a short latency. Over capacity,
 * requests are throttled (`ProvisionedThroughputExceededException`).
 *
 * One request uses one capacity unit, as for items up to 4 KB read with
 * strong consistency or up to 1 KB written. Per-partition limits (hot keys)
 * aren't modeled yet.
 * See docs/design/fidelity.md: DDB-1 to DDB-5.
 */
export const dynamoDbDefinition: ComponentDefinition<DynamoDbConfig> = {
  type: "dynamodb",
  displayName: "DynamoDB",
  configSchema: dynamoDbConfig,
  defaultConfig: {
    readUnitsPerSec: 1_000,
    writeUnitsPerSec: 500,
    burstSec: 300,
    latency: { kind: "lognormal", medianMs: 5, p99Ms: 20 },
  },
  actions: ["read", "write"],
  deliversAsync: false,
  build<T>(
    config: DynamoDbConfig,
    { random }: BuildContext,
  ): ComponentBehavior<T> {
    const bucket = (unitsPerSec: number) =>
      new RateLimit({
        ratePerSec: unitsPerSec,
        burst: Math.max(1, unitsPerSec * config.burstSec),
      });
    const reads = bucket(config.readUnitsPerSec);
    const writes = bucket(config.writeUnitsPerSec);
    const latency = new ServiceTime(config.latency, random);
    let inProgress = 0;
    return {
      arrive(request, action, nowMs) {
        const capacity = action === "write" ? writes : reads;
        if (!capacity.tryTake(nowMs)) {
          return [{ kind: "rejected", request, reason: "throttled" }];
        }
        inProgress++;
        return [{ kind: "started", request, serviceMs: latency.next() }];
      },
      finish() {
        inProgress--;
        return [];
      },
      get inProgress() {
        return inProgress;
      },
      queueDepth: 0,
    };
  },
};
