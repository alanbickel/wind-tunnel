import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../random/random-source";
import { checkComponentContract } from "../check-component-contract";
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

  it("queues for a worker, then rejects once connections run out", () => {
    const db = build();
    expect(db.arrive("a", "read", 0)).toEqual([
      { kind: "started", request: "a", serviceMs: 15 },
    ]);
    expect(db.arrive("b", "write", 0)).toEqual([
      { kind: "queued", request: "b" },
    ]);
    expect(db.arrive("c", "read", 0)).toEqual([
      { kind: "queued", request: "c" },
    ]);
    expect(db.arrive("d", "read", 0)).toEqual([
      { kind: "rejected", request: "d", reason: "too-many-connections" },
    ]);
    expect([db.inProgress, db.queueDepth]).toEqual([1, 2]);
    // Waiting queries hold their connection too.
    expect(db.gauges).toEqual({ connectionsHeld: 3 });
  });

  it("hands a freed worker to the next waiter and frees a connection", () => {
    const db = build();
    db.arrive("a", "read", 0);
    db.arrive("b", "read", 0);
    db.arrive("c", "read", 0);
    expect(db.finish("a", 15)).toEqual([
      { kind: "started", request: "b", serviceMs: 15 },
    ]);
    expect(db.arrive("d", "read", 15)).toEqual([
      { kind: "queued", request: "d" },
    ]);
  });
});
