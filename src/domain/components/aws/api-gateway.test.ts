import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../random/seeded-random";
import { checkComponentContract } from "../check-component-contract";
import { limitValues } from "../testing/limit-values";
import { apiGatewayDefinition, type ApiGatewayConfig } from "./api-gateway";

const build = (config: Partial<ApiGatewayConfig> = {}) =>
  apiGatewayDefinition.build<string>(
    {
      ratePerSec: 10,
      burst: 2,
      overhead: { kind: "constant", valueMs: 10 },
      ...config,
    },
    { random: new SeededRandom(1) },
  );

describe("apiGatewayDefinition", () => {
  it("passes the component contract", () => {
    expect(checkComponentContract(apiGatewayDefinition).violations).toEqual([]);
  });

  it("passes the component contract while throttling", () => {
    const report = checkComponentContract(apiGatewayDefinition, {
      config: {
        ...apiGatewayDefinition.defaultConfig,
        ratePerSec: 100,
        burst: 10,
      },
    });
    expect(report.violations).toEqual([]);
    expect(report.stats.rejected).toBeGreaterThan(0);
  });

  it("starts requests with its overhead until the burst is used up", () => {
    const api = build();
    expect(api.arrive({ request: "a", action: "invoke", nowMs: 0 })).toEqual([
      { kind: "started", request: "a", serviceMs: 10 },
    ]);
    expect(
      api.arrive({ request: "b", action: "invoke", nowMs: 0 }),
    ).toHaveLength(1);
    expect(api.arrive({ request: "c", action: "invoke", nowMs: 0 })).toEqual([
      { kind: "rejected", request: "c", reason: "throttled" },
    ]);
    expect(api.inProgress).toBe(2);
  });

  // Fails if API Gateway stops reporting its rate limit, counts a throttled
  // request as a token taken, reports the bucket's level wrong, or declares
  // a reason other than the one it throttles with.
  it("reports its request rate, the tokens taken, and the tokens left", () => {
    const api = build();
    for (const request of ["a", "b", "c"]) {
      api.arrive({ request, action: "invoke", nowMs: 0 });
    }
    expect(limitValues(api)).toEqual([
      {
        kind: "rate",
        name: "requestRate",
        whenFull: { kind: "refuse", reason: "throttled" },
        ratePerSec: 10,
        burst: 2,
        taken: 2,
        tokensLeft: 0,
      },
    ]);
    // Half a second refills 5 tokens, but the bucket holds only 2.
    expect(limitValues(api, 50)[0]).toMatchObject({ tokensLeft: 0.5 });
    expect(limitValues(api, 500)[0]).toMatchObject({ tokensLeft: 2 });
  });

  it("lets requests through again at the steady rate", () => {
    const api = build();
    api.arrive({ request: "a", action: "invoke", nowMs: 0 });
    api.arrive({ request: "b", action: "invoke", nowMs: 0 });
    expect(
      api.arrive({ request: "c", action: "invoke", nowMs: 100 })[0]?.kind,
    ).toBe("started");
    expect(
      api.arrive({ request: "d", action: "invoke", nowMs: 100 })[0]?.kind,
    ).toBe("rejected");
  });
});
