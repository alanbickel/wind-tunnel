import { describe, expect, it } from "vitest";
import { z } from "zod";
import { distributionSchema } from "../random/distribution";
import { SeededRandom } from "../random/seeded-random";
import { AWS_EDGE_DEFAULTS } from "./aws/edge-defaults";
import { checkComponentContract } from "./check-component-contract";
import { rateLimitedServiceDefinition } from "./rate-limited-service";
import { limitValues } from "./testing/limit-values";

const config = z.object({
  ratePerSec: z.number().positive(),
  readTime: distributionSchema,
  writeTime: distributionSchema,
});

// A type whose reads and writes share one bucket but not a service time,
// the other way round from DynamoDB, so the base is shown to allow both.
const definition = rateLimitedServiceDefinition({
  type: "shared-bucket",
  displayName: "Shared bucket",
  configSchema: config,
  defaultConfig: {
    ratePerSec: 100,
    readTime: { kind: "constant", valueMs: 2 },
    writeTime: { kind: "constant", valueMs: 7 },
  },
  edgeDefaults: AWS_EDGE_DEFAULTS,
  refusal: { kind: "refuse", reason: "slow-down" },
  limits: { requests: ({ ratePerSec }) => ({ ratePerSec, burst: 1 }) },
  actions: {
    read: { limit: "requests", serviceTime: "readTime" },
    write: { limit: "requests", serviceTime: "writeTime" },
  },
});

const build = () =>
  definition.build<string>(definition.defaultConfig, {
    random: new SeededRandom(1),
  });

describe("rateLimitedServiceDefinition", () => {
  // Fails if the definition lists actions or reasons other than the spec's,
  // or delivers async work.
  it("takes its actions and its one rejection reason from the spec", () => {
    expect(definition.actions).toEqual(["read", "write"]);
    expect(definition.rejectionReasons).toEqual(["slow-down"]);
    expect(definition.deliversAsync).toBe(false);
  });

  // Fails if an action takes a token from a bucket other than the one its
  // limit reports, so the limit has room when a request is refused.
  it("passes the component contract, with its limit refusing", () => {
    const report = checkComponentContract(definition);
    expect(report.violations).toEqual([]);
    expect(report.stats.rejected).toBeGreaterThan(0);
  });

  // Fails if each action gets a bucket of its own, or the service time
  // comes from another action's setting.
  it("serves each action for its own time, from the bucket they share", () => {
    const service = build();
    expect(service.arrive({ request: "w", action: "write", nowMs: 0 })).toEqual(
      [{ kind: "started", request: "w", serviceMs: 7 }],
    );
    expect(service.arrive({ request: "r", action: "read", nowMs: 0 })).toEqual([
      { kind: "rejected", request: "r", reason: "slow-down" },
    ]);
    expect(service.arrive({ request: "r", action: "read", nowMs: 10 })).toEqual(
      [{ kind: "started", request: "r", serviceMs: 2 }],
    );
    expect(limitValues(service, 10)).toMatchObject([
      { name: "requests", whenFull: { reason: "slow-down" }, taken: 2 },
    ]);
  });

  // Fails if an action the type doesn't accept is served from another
  // action's bucket instead of failing loudly.
  it("throws for an action the type doesn't accept", () => {
    expect(() =>
      build().arrive({ request: "x", action: "enqueue", nowMs: 0 }),
    ).toThrow('No action "enqueue"');
  });
});
