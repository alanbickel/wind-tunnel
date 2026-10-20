import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../random/seeded-random";
import { checkComponentContract } from "../check-component-contract";
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

describe("dynamoDbDefinition", () => {
  it("passes the component contract", () => {
    expect(checkComponentContract(dynamoDbDefinition).violations).toEqual([]);
  });

  it("passes the component contract while throttling", () => {
    const report = checkComponentContract(dynamoDbDefinition, {
      config: {
        ...dynamoDbDefinition.defaultConfig,
        readUnitsPerSec: 100,
        writeUnitsPerSec: 50,
        burstSec: 0,
      },
    });
    expect(report.violations).toEqual([]);
    expect(report.stats.rejected).toBeGreaterThan(0);
  });

  it("throttles reads and writes separately", () => {
    const db = build();
    expect(db.arrive({ request: "r1", action: "read", nowMs: 0 })).toEqual([
      { kind: "started", request: "r1", serviceMs: 5 },
    ]);
    expect(db.arrive({ request: "r2", action: "read", nowMs: 0 })).toEqual([
      { kind: "rejected", request: "r2", reason: "throttled" },
    ]);
    expect(
      db.arrive({ request: "w1", action: "write", nowMs: 0 })[0]?.kind,
    ).toBe("started");
    expect(db.inProgress).toBe(2);
  });

  // Fails if DynamoDB stops reporting either capacity, counts a throttled
  // request as capacity taken, or drains the wrong bucket.
  it("reports read and write capacity taken and left", () => {
    const db = build({ burstSec: 0 });
    db.arrive({ request: "r1", action: "read", nowMs: 0 });
    db.arrive({ request: "r2", action: "read", nowMs: 0 });
    expect(limitValues(db)).toEqual([
      {
        kind: "rate",
        name: "readUnits",
        ratePerSec: 10,
        burst: 1,
        taken: 1,
        tokensLeft: 0,
      },
      {
        kind: "rate",
        name: "writeUnits",
        ratePerSec: 10,
        burst: 1,
        taken: 0,
        tokensLeft: 1,
      },
    ]);
  });

  it("spends saved-up capacity in a burst", () => {
    const db = build({ burstSec: 2 });
    const started = Array.from(
      { length: 25 },
      (_, i) =>
        db.arrive({ request: String(i), action: "read", nowMs: 0 })[0]?.kind,
    ).filter((kind) => kind === "started");
    expect(started).toHaveLength(20);
  });
});
