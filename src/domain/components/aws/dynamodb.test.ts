import { describe, expect, it } from "vitest";
import type { StepAction } from "../../model/project";
import { SeededRandom } from "../../random/seeded-random";
import { checkComponentContract } from "../check-component-contract";
import type { ComponentBehavior, RequestSettings } from "../component-behavior";
import { limitValues } from "../testing/limit-values";
import { dynamoDbDefinition, type DynamoDbConfig } from "./dynamodb";

const build = (config: Partial<DynamoDbConfig> = {}) =>
  dynamoDbDefinition.build<string>(
    {
      readUnitsPerSec: 10,
      writeUnitsPerSec: 10,
      burstSec: 0,
      latency: { kind: "constant", valueMs: 5 },
      ...config,
    },
    { random: new SeededRandom(1) },
  );

/** A step's settings for `action`, parsed as the registry parses them. */
function settingsOf(
  action: StepAction,
  settings: RequestSettings = {},
): RequestSettings {
  const schema = dynamoDbDefinition.requestSettings?.[action];
  if (schema === undefined) throw new Error(`No settings for ${action}`);
  return schema.parse(settings);
}

/** One request at time 0, and whether it started. */
interface SendInput {
  readonly action: StepAction;
  readonly settings?: RequestSettings;
}

function send(db: ComponentBehavior<string>, input: SendInput): string {
  const settings = settingsOf(input.action, input.settings);
  const effects = db.arrive({
    request: "r",
    action: input.action,
    settings,
    nowMs: 0,
  });
  return effects[0]?.kind ?? "none";
}

/** The units `action`'s bucket has given out so far. */
function taken(db: ComponentBehavior<string>, name: string): number {
  const limit = limitValues(db).find((l) => l.name === name);
  if (limit?.kind !== "rate") throw new Error(`No rate limit ${name}`);
  return limit.taken;
}

describe("dynamoDbDefinition", () => {
  it("passes the component contract", () => {
    expect(checkComponentContract(dynamoDbDefinition).violations).toEqual([]);
  });

  // Fails if a throttling table breaks the contract, or these rates stop
  // throttling: the buckets hold only the largest request (DDB-6), which
  // 2,000 default requests run dry. A 4 KB default item, half the requests,
  // throttles nothing.
  it("passes the component contract while throttling", () => {
    const report = checkComponentContract(dynamoDbDefinition, {
      requests: 2_000,
      config: {
        ...dynamoDbDefinition.defaultConfig,
        readUnitsPerSec: 5,
        writeUnitsPerSec: 5,
        burstSec: 0,
      },
    });
    expect(report.violations).toEqual([]);
    expect(report.stats.rejected).toBeGreaterThan(0);
  });

  // Fails if a bucket counts as exhausted only below one token (#314): a
  // 40 KB strong read costs 10 units and a 40 KB write 40, so they're
  // throttled with several units left, and the contract finds them
  // "rejected as throttled while readUnits, writeUnits had room".
  it("passes the component contract while throttling large items", () => {
    const report = checkComponentContract(dynamoDbDefinition, {
      requests: 2_000,
      config: {
        ...dynamoDbDefinition.defaultConfig,
        readUnitsPerSec: 50,
        writeUnitsPerSec: 50,
        burstSec: 0,
      },
      requestSettings: {
        read: [{ itemSizeKb: 40, consistency: "strong" }],
        write: [{ itemSizeKb: 40 }],
      },
    });
    expect(report.violations).toEqual([]);
    expect(report.stats.rejected).toBeGreaterThan(0);
  });

  // Fails if a step's settings default to anything but a 1 KB item, read
  // eventually consistent, as the profile's defaults table says.
  it("defaults to a 1 KB item, read eventually consistent", () => {
    expect(settingsOf("read")).toEqual({
      itemSizeKb: 1,
      consistency: "eventual",
    });
    expect(settingsOf("write")).toEqual({ itemSizeKb: 1 });
  });

  // Fails if an eventually consistent read costs a whole unit, as it did
  // before DDB-1 closed, or the read's settings are ignored.
  it("charges an eventually consistent read half a unit", () => {
    const db = build();
    send(db, { action: "read" });
    expect(taken(db, "readUnits")).toBe(0.5);
  });

  // Fails if a strongly consistent read is charged as an eventual one.
  it("charges a strongly consistent read one unit", () => {
    const db = build();
    send(db, { action: "read", settings: { consistency: "strong" } });
    expect(taken(db, "readUnits")).toBe(1);
  });

  // Fails if a read's size isn't rounded up to whole 4 KB units, or isn't
  // counted at all: 9 KB is three units strong, one and a half eventual.
  it.each([
    ["strong", 3],
    ["eventual", 1.5],
  ] as const)(
    "charges a 9 KB %s read per started 4 KB",
    (consistency, units) => {
      const db = build();
      send(db, { action: "read", settings: { itemSizeKb: 9, consistency } });
      expect(taken(db, "readUnits")).toBe(units);
    },
  );

  // Fails if a write's size is counted in 4 KB units, as a read's is, or
  // not at all: a 3 KB write takes three write units.
  it("charges a write one unit per KB", () => {
    const db = build();
    send(db, { action: "write", settings: { itemSizeKb: 3 } });
    expect(taken(db, "writeUnits")).toBe(3);
  });

  // Fails if a step's settings accept an item over DynamoDB's 400 KB, a
  // fraction of a KB, or a consistency AWS doesn't offer.
  it.each([
    ["read", { itemSizeKb: 401 }],
    ["write", { itemSizeKb: 0.5 }],
    ["read", { consistency: "transactional" }],
    ["write", { consistency: "strong" }],
  ] as const)("rejects %s settings %j", (action, settings) => {
    expect(() => settingsOf(action, settings)).toThrow();
  });

  // Fails if a bucket smaller than the largest request is allowed, which
  // would refuse a 400 KB item for ever at a small burstSec (DDB-6).
  it("serves the largest request with no burst saved up", () => {
    const db = build({ burstSec: 0 });
    const largest = { itemSizeKb: 400 };
    expect(
      send(db, {
        action: "read",
        settings: { ...largest, consistency: "strong" },
      }),
    ).toBe("started");
    expect(send(db, { action: "write", settings: largest })).toBe("started");
    expect(taken(db, "readUnits")).toBe(100);
    expect(taken(db, "writeUnits")).toBe(400);
  });

  // Fails if reads and writes share a bucket, or a request is served with
  // less capacity left than it costs.
  it("throttles reads and writes separately", () => {
    const db = build();
    const large = { itemSizeKb: 400, consistency: "strong" };
    expect(send(db, { action: "read", settings: large })).toBe("started");
    expect(send(db, { action: "read" })).toBe("rejected");
    expect(send(db, { action: "write" })).toBe("started");
    expect(db.inProgress).toBe(2);
  });

  // Fails if DynamoDB stops reporting either capacity, counts a throttled
  // request as capacity taken or doesn't count it as refused (the 50-unit
  // read, with 1 unit left), drains the wrong bucket, or declares a reason
  // other than the one it throttles with.
  it("reports read and write capacity taken and left", () => {
    const db = build({ burstSec: 0 });
    send(db, {
      action: "read",
      settings: { itemSizeKb: 396, consistency: "strong" },
    });
    send(db, { action: "read", settings: { itemSizeKb: 400 } });
    send(db, { action: "write", settings: { itemSizeKb: 3 } });
    expect(limitValues(db)).toEqual([
      {
        kind: "rate",
        name: "readUnits",
        whenFull: { kind: "refuse", reason: "throttled" },
        ratePerSec: 10,
        burst: 100,
        taken: 99,
        refused: 1,
        tokensLeft: 1,
      },
      {
        kind: "rate",
        name: "writeUnits",
        whenFull: { kind: "refuse", reason: "throttled" },
        ratePerSec: 10,
        burst: 400,
        taken: 3,
        refused: 0,
        tokensLeft: 397,
      },
    ]);
  });

  // Fails if burstSec stops sizing the bucket once it holds more than the
  // largest request: 300 s of 10 units is 3,000.
  it("spends saved-up capacity in a burst", () => {
    const db = build({ burstSec: 300 });
    const started = Array.from({ length: 6_100 }, () =>
      send(db, { action: "read" }),
    ).filter((kind) => kind === "started");
    expect(started).toHaveLength(6_000);
  });
});
