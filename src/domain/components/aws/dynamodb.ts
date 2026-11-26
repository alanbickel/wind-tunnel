import { z } from "zod";
import type { TokenBucketInput } from "../../behaviors/token-bucket";
import { distributionSchema } from "../../random/distribution";
import type { RefuseWhenFull, RequestSettings } from "../component-behavior";
import { rateLimitedServiceDefinition } from "../rate-limited-service";
import { AWS_EDGE_DEFAULTS } from "./edge-defaults";

const dynamoDbConfig = z.object({
  /** Provisioned read capacity units per second; a read uses 0.5 or more. */
  readUnitsPerSec: z.number().positive(),
  /** Provisioned write capacity units per second; a write uses 1 or more. */
  writeUnitsPerSec: z.number().positive(),
  /**
   * Seconds of unused capacity the table can save up and spend in a burst.
   * AWS keeps up to 300 seconds' worth, but doesn't guarantee it.
   */
  burstSec: z.number().nonnegative(),
  latency: distributionSchema,
});
export type DynamoDbConfig = z.infer<typeof dynamoDbConfig>;

/** DynamoDB's largest item, in KB: 400 KB, attribute names included. */
const MAX_ITEM_SIZE_KB = 400;

/**
 * The size of the item a request reads or writes, in whole KB, rounded up:
 * AWS charges per started 4 KB (reads) or 1 KB (writes), so whole KB give
 * the same units as bytes would. 1 KB by default, within one unit of either.
 */
const itemSizeKb = z.number().int().min(1).max(MAX_ITEM_SIZE_KB).default(1);

/** A `read` step's request settings (ADR-0024). */
const dynamoDbReadSettings = z.strictObject({
  itemSizeKb,
  /** Eventually consistent by default, as in AWS; strong costs double. */
  consistency: z.enum(["eventual", "strong"]).default("eventual"),
});
type DynamoDbReadSettings = z.output<typeof dynamoDbReadSettings>;

/** A `write` step's request settings (ADR-0024). */
const dynamoDbWriteSettings = z.strictObject({ itemSizeKb });
type DynamoDbWriteSettings = z.output<typeof dynamoDbWriteSettings>;

/** KB of item one read unit covers, and the share of it a read takes. */
const READ_UNIT_KB = 4;
const READ_SHARE: Readonly<
  Record<DynamoDbReadSettings["consistency"], number>
> = { eventual: 0.5, strong: 1 };

/** KB of item one write unit covers. */
const WRITE_UNIT_KB = 1;

/**
 * Read units a read takes: one per started 4 KB of the item, halved if
 * eventually consistent. A default read (1 KB, eventual) takes half a unit.
 */
function readUnitsOf(settings: RequestSettings): number {
  // The registry parsed `settings` with the read schema, so the cast holds.
  const { itemSizeKb, consistency } =
    settings as unknown as DynamoDbReadSettings;
  return Math.ceil(itemSizeKb / READ_UNIT_KB) * READ_SHARE[consistency];
}

/** Write units a write takes: one per started 1 KB of the item. */
function writeUnitsOf(settings: RequestSettings): number {
  // The registry parsed `settings` with the write schema, so the cast holds.
  const { itemSizeKb } = settings as unknown as DynamoDbWriteSettings;
  return Math.ceil(itemSizeKb / WRITE_UNIT_KB);
}

/** The most a read can cost: the largest item, strongly consistent. */
const LARGEST_READ_UNITS = readUnitsOf({
  itemSizeKb: MAX_ITEM_SIZE_KB,
  consistency: "strong",
});

/** The most a write can cost: the largest item. */
const LARGEST_WRITE_UNITS = writeUnitsOf({ itemSizeKb: MAX_ITEM_SIZE_KB });

/** Rejects a request that finds less of its capacity left than it costs. */
const THROTTLED: RefuseWhenFull = { kind: "refuse", reason: "throttled" };

/**
 * Amazon DynamoDB with provisioned capacity (MVP design §3.2): one token
 * bucket for reads and one for writes, then a short latency. Over capacity,
 * requests are throttled (`ProvisionedThroughputExceededException`).
 *
 * A request takes the units AWS charges, from its step's item size and,
 * for a read, its consistency. Each bucket holds at least the largest
 * request, however small `burstSec` is (DDB-6). Per-partition limits (hot
 * keys) aren't modeled yet.
 * See docs/design/fidelity/dynamodb/dynamodb-fidelity.md: DDB-2 to DDB-6.
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
  // DynamoDB's SDK clients make 4 attempts and wait from 25 ms after a
  // transient error (ADR-0025 decision 3.3; fidelity ENG-2).
  sdkRetryDefaults: { maxAttempts: 4, transientBaseDelayMs: 25 },
  refusal: THROTTLED,
  // ProvisionedThroughputExceededException (ADR-0025 decision 7).
  refusalKind: "throttling",
  limits: {
    readUnits: (config) =>
      capacityBucket(config, {
        unitsPerSec: config.readUnitsPerSec,
        largestCost: LARGEST_READ_UNITS,
      }),
    writeUnits: (config) =>
      capacityBucket(config, {
        unitsPerSec: config.writeUnitsPerSec,
        largestCost: LARGEST_WRITE_UNITS,
      }),
  },
  actions: {
    read: { limit: "readUnits", cost: readUnitsOf, serviceTime: "latency" },
    write: { limit: "writeUnits", cost: writeUnitsOf, serviceTime: "latency" },
  },
  requestSettings: {
    read: dynamoDbReadSettings,
    write: dynamoDbWriteSettings,
  },
});

/** One kind of capacity: its rate, and the most one request can take of it. */
interface CapacityInput {
  readonly unitsPerSec: number;
  readonly largestCost: number;
}

/**
 * One kind of capacity, read or write, with `burstSec` of it saved up, but
 * room for the largest request at least, so none is refused for ever (DDB-6).
 */
function capacityBucket(
  { burstSec }: DynamoDbConfig,
  { unitsPerSec, largestCost }: CapacityInput,
): TokenBucketInput {
  return {
    ratePerSec: unitsPerSec,
    burst: Math.max(largestCost, unitsPerSec * burstSec),
  };
}
