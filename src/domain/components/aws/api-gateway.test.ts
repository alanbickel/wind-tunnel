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

  // Fails if API Gateway stops reporting its rate limit, or counts a
  // throttled request as a token taken.
  it("reports its request rate and the tokens taken, not throttled", () => {
    const api = build();
    for (const request of ["a", "b", "c"]) {
      api.arrive({ request, action: "invoke", nowMs: 0 });
    }
    expect(limitValues(api)).toEqual([
      { kind: "rate", name: "requestRate", ratePerSec: 10, burst: 2, taken: 2 },
    ]);
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
