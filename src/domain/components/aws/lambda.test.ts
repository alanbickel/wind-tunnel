import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../random/seeded-random";
import type { Effect } from "../component-behavior";
import { checkComponentContract } from "../check-component-contract";
import { limitValues } from "../testing/limit-values";
import { lambdaDefinition, type LambdaConfig } from "./lambda";

const build = (config: Partial<LambdaConfig> = {}) =>
  lambdaDefinition.build<string>(
    {
      concurrency: 2,
      coldStart: { kind: "constant", valueMs: 300 },
      idleTimeoutSec: 60,
      computeTime: { kind: "constant", valueMs: 20 },
      ...config,
    },
    { random: new SeededRandom(1) },
  );

/** The service time of a `started` outcome; 320 ms is cold, 20 ms is warm. */
const serviceMs = (effects: Effect<string>[]) =>
  effects[0]?.kind === "started" ? effects[0].serviceMs : undefined;

describe("lambdaDefinition", () => {
  it("passes the component contract", () => {
    expect(checkComponentContract(lambdaDefinition).violations).toEqual([]);
  });

  it("passes the component contract while throttling", () => {
    const report = checkComponentContract(lambdaDefinition, {
      config: { ...lambdaDefinition.defaultConfig, concurrency: 5 },
    });
    expect(report.violations).toEqual([]);
    expect(report.stats.rejected).toBeGreaterThan(0);
  });

  it("cold-starts the first invocation and reuses the warm environment", () => {
    const fn = build();
    expect(
      serviceMs(fn.arrive({ request: "a", action: "invoke", nowMs: 0 })),
    ).toBe(320);
    fn.finish({ request: "a", nowMs: 320 });
    expect(
      serviceMs(fn.arrive({ request: "b", action: "invoke", nowMs: 400 })),
    ).toBe(20);
  });

  it("cold-starts when every warm environment is busy", () => {
    const fn = build();
    fn.arrive({ request: "a", action: "invoke", nowMs: 0 });
    fn.finish({ request: "a", nowMs: 320 });
    expect(
      serviceMs(fn.arrive({ request: "b", action: "invoke", nowMs: 400 })),
    ).toBe(20);
    expect(
      serviceMs(fn.arrive({ request: "c", action: "invoke", nowMs: 400 })),
    ).toBe(320);
  });

  it("goes cold after the idle timeout", () => {
    const fn = build();
    fn.arrive({ request: "a", action: "invoke", nowMs: 0 });
    fn.finish({ request: "a", nowMs: 320 });
    expect(
      serviceMs(fn.arrive({ request: "b", action: "invoke", nowMs: 60_320 })),
    ).toBe(320);
  });

  it("expires only the environments that have been idle too long", () => {
    const fn = build();
    fn.arrive({ request: "a", action: "invoke", nowMs: 0 });
    fn.arrive({ request: "b", action: "invoke", nowMs: 0 });
    fn.finish({ request: "a", nowMs: 320 });
    fn.finish({ request: "b", nowMs: 30_000 });
    // At 61 s, the environment a used has been idle for over 60 s; b's hasn't.
    expect(
      serviceMs(fn.arrive({ request: "c", action: "invoke", nowMs: 61_000 })),
    ).toBe(20);
    expect(
      serviceMs(fn.arrive({ request: "d", action: "invoke", nowMs: 61_000 })),
    ).toBe(320);
  });

  it("throttles beyond its concurrency, counting cold starts", () => {
    const fn = build();
    fn.arrive({ request: "a", action: "invoke", nowMs: 0 });
    fn.arrive({ request: "b", action: "invoke", nowMs: 0 });
    expect(fn.arrive({ request: "c", action: "invoke", nowMs: 0 })).toEqual([
      { kind: "rejected", request: "c", reason: "throttled" },
    ]);
    expect(fn.inProgress).toBe(2);
    fn.finish({ request: "a", nowMs: 320 });
    expect(
      fn.arrive({ request: "c", action: "invoke", nowMs: 320 })[0]?.kind,
    ).toBe("started");
    // a and b started cold; c reused a's warm environment.
    expect(fn.counters).toEqual({ coldStarts: 2 });
  });

  // Fails if Lambda stops reporting its concurrency limit, or reports
  // something other than the slots in use.
  it("reports its concurrency limit and the slots in use", () => {
    const fn = build();
    fn.arrive({ request: "a", action: "invoke", nowMs: 0 });
    expect(limitValues(fn)).toEqual([
      { kind: "concurrency", name: "concurrency", limit: 2, inUse: 1 },
    ]);
  });

  it("throttles everything with concurrency 0", () => {
    const fn = build({ concurrency: 0 });
    expect(
      fn.arrive({ request: "a", action: "invoke", nowMs: 0 })[0]?.kind,
    ).toBe("rejected");
  });
});
