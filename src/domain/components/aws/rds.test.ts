import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../random/seeded-random";
import { checkComponentContract } from "../check-component-contract";
import { limitValues } from "../testing/limit-values";
import { rdsDefinition, type RdsConfig } from "./rds";

const build = (config: Partial<RdsConfig> = {}) =>
  rdsDefinition.build<string>(
    {
      maxConnections: 3,
      queryWorkers: 1,
      queryTime: { kind: "constant", valueMs: 15 },
      ...config,
    },
    { random: new SeededRandom(1) },
  );

describe("rdsDefinition", () => {
  it("passes the component contract", () => {
    expect(checkComponentContract(rdsDefinition).violations).toEqual([]);
  });

  it("passes the component contract while out of connections", () => {
    const report = checkComponentContract(rdsDefinition, {
      config: {
        ...rdsDefinition.defaultConfig,
        maxConnections: 8,
        queryWorkers: 2,
      },
    });
    expect(report.violations).toEqual([]);
    expect(report.stats.queued).toBeGreaterThan(0);
    expect(report.stats.rejected).toBeGreaterThan(0);
  });

  // Fails if a waiting query stops holding a connection, or if RDS stops
  // reporting either limit.
  it("queues for a worker, then rejects once connections run out", () => {
    const db = build();
    expect(db.arrive({ request: "a", action: "read", nowMs: 0 })).toEqual([
      { kind: "started", request: "a", serviceMs: 15 },
    ]);
    expect(db.arrive({ request: "b", action: "write", nowMs: 0 })).toEqual([
      { kind: "queued", request: "b" },
    ]);
    expect(db.arrive({ request: "c", action: "read", nowMs: 0 })).toEqual([
      { kind: "queued", request: "c" },
    ]);
    expect(db.arrive({ request: "d", action: "read", nowMs: 0 })).toEqual([
      { kind: "rejected", request: "d", reason: "too-many-connections" },
    ]);
    expect([db.inProgress, db.queueDepth]).toEqual([1, 2]);
    // Waiting queries hold their connection too.
    expect(limitValues(db)).toEqual([
      { kind: "concurrency", name: "connections", limit: 3, inUse: 3 },
      { kind: "concurrency", name: "queryWorkers", limit: 1, inUse: 1 },
    ]);
  });

  it("hands a freed worker to the next waiter and frees a connection", () => {
    const db = build();
    db.arrive({ request: "a", action: "read", nowMs: 0 });
    db.arrive({ request: "b", action: "read", nowMs: 0 });
    db.arrive({ request: "c", action: "read", nowMs: 0 });
    expect(db.finish({ request: "a", nowMs: 15 })).toEqual([
      { kind: "started", request: "b", serviceMs: 15 },
    ]);
    expect(db.arrive({ request: "d", action: "read", nowMs: 15 })).toEqual([
      { kind: "queued", request: "d" },
    ]);
  });
});
