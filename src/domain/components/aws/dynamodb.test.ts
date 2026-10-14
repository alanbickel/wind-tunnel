import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../random/random-source";
import { checkComponentContract } from "../check-component-contract";
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
    expect(db.arrive("r1", "read", 0)).toEqual([
      { kind: "started", request: "r1", serviceMs: 5 },
    ]);
    expect(db.arrive("r2", "read", 0)).toEqual([
      { kind: "rejected", request: "r2", reason: "throttled" },
    ]);
    expect(db.arrive("w1", "write", 0)[0]?.kind).toBe("started");
    expect(db.inProgress).toBe(2);
  });

  it("spends saved-up capacity in a burst", () => {
    const db = build({ burstSec: 2 });
    const started = Array.from(
      { length: 25 },
      (_, i) => db.arrive(String(i), "read", 0)[0]?.kind,
    ).filter((kind) => kind === "started");
    expect(started).toHaveLength(20);
  });
});
