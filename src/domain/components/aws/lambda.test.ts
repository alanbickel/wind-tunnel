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

  // Fails if Lambda stops reporting either limit, reports something other
  // than the slots in use or the tokens taken, derives the rate from
  // anything but 10 × concurrency, or stops declaring that a full limit
  // throttles.
  it("reports its concurrency and its request rate of 10 × concurrency", () => {
    const fn = build();
    fn.arrive({ request: "a", action: "invoke", nowMs: 0 });
    expect(limitValues(fn)).toEqual([
      {
        kind: "concurrency",
        name: "concurrency",
        whenFull: { kind: "refuse", reason: "throttled" },
        limit: 2,
        inUse: 1,
      },
      {
        kind: "rate",
        name: "requestRate",
        whenFull: { kind: "refuse", reason: "throttled" },
        ratePerSec: 20,
        burst: 20,
        taken: 1,
        tokensLeft: 19,
      },
    ]);
  });

  // Fails if Lambda stops taking a token per invocation (the 21st starts),
  // takes a slot for an invocation the rate refuses (inProgress 1), or
  // stops refilling the bucket at the rate.
  it("throttles a short function at its request rate while concurrency has room", () => {
    const fn = build({ computeTime: { kind: "constant", valueMs: 1 } });
    // 20 invocations in the first 10 ms, one at a time: concurrency 1 of 2.
    for (let i = 0; i < 20; i++) {
      fn.arrive({ request: `r${String(i)}`, action: "invoke", nowMs: i / 2 });
      fn.finish({ request: `r${String(i)}`, nowMs: i / 2 });
    }
    expect(fn.arrive({ request: "x", action: "invoke", nowMs: 10 })).toEqual([
      { kind: "rejected", request: "x", reason: "throttled" },
    ]);
    expect(fn.inProgress).toBe(0);
    // At 20 a second, a token comes back every 50 ms.
    expect(
      fn.arrive({ request: "y", action: "invoke", nowMs: 60 })[0]?.kind,
    ).toBe("started");
  });

  // Fails if an invocation refused for want of a slot still takes a token
  // (taken 3, not 2).
  it("takes no token for an invocation its concurrency refuses", () => {
    const fn = build();
    fn.arrive({ request: "a", action: "invoke", nowMs: 0 });
    fn.arrive({ request: "b", action: "invoke", nowMs: 0 });
    expect(
      fn.arrive({ request: "c", action: "invoke", nowMs: 0 })[0]?.kind,
    ).toBe("rejected");
    expect(limitValues(fn)[1]).toMatchObject({ taken: 2, tokensLeft: 18 });
  });

  // Fails if concurrency 0 starts an invocation, or if the request rate is
  // checked first, so the bucket's one token is taken and the refusal
  // belongs to it rather than to concurrency.
  it("throttles everything with concurrency 0, at its concurrency", () => {
    const fn = build({ concurrency: 0 });
    expect(
      fn.arrive({ request: "a", action: "invoke", nowMs: 0 })[0]?.kind,
    ).toBe("rejected");
    expect(limitValues(fn)).toMatchObject([
      { name: "concurrency", limit: 0, inUse: 0 },
      { name: "requestRate", ratePerSec: 0, taken: 0, tokensLeft: 1 },
    ]);
  });
});
