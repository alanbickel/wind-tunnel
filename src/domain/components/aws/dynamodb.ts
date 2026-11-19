import { z } from "zod";
import type { TokenBucketInput } from "../../behaviors/token-bucket";
import { distributionSchema } from "../../random/distribution";
import type { RefuseWhenFull } from "../component-behavior";
import { rateLimitedServiceDefinition } from "../rate-limited-service";
import { AWS_EDGE_DEFAULTS } from "./edge-defaults";

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

/** Rejects a request that finds less than one unit of its capacity left. */
const THROTTLED: RefuseWhenFull = { kind: "refuse", reason: "throttled" };

/**
 * Amazon DynamoDB with provisioned capacity (MVP design §3.2): one token
 * bucket for reads and one for writes, then a short latency. Over capacity,
 * requests are throttled (`ProvisionedThroughputExceededException`).
 *
 * One request uses one capacity unit, as for items up to 4 KB read with
 * strong consistency or up to 1 KB written. Per-partition limits (hot keys)
 * aren't modeled yet.
 * See docs/design/fidelity/dynamodb/dynamodb-fidelity.md: DDB-1 to DDB-5.
 */
export const dynamoDbDefinition = rateLimitedServiceDefinition({
  type: "dynamodb",
  displayName: "DynamoDB",
  configSchema: dynamoDbConfig,
  defaultConfig: {
    readUnitsPerSec: 1_000,
    writeUnitsPerSec: 500,
    burstSec: 300,
    latency: { kind: "lognormal", medianMs: 5, p99Ms: 20 },
  },
  edgeDefaults: AWS_EDGE_DEFAULTS,
  refusal: THROTTLED,
  limits: {
    readUnits: (config) => capacityBucket(config.readUnitsPerSec, config),
    writeUnits: (config) => capacityBucket(config.writeUnitsPerSec, config),
  },
  actions: {
    read: { limit: "readUnits", serviceTime: "latency" },
    write: { limit: "writeUnits", serviceTime: "latency" },
  },
});

/** One kind of capacity, read or write, with `burstSec` of it saved up. */
function capacityBucket(
  unitsPerSec: number,
  { burstSec }: DynamoDbConfig,
): TokenBucketInput {
  return {
    ratePerSec: unitsPerSec,
    burst: Math.max(1, unitsPerSec * burstSec),
  };
}
