import { z } from "zod";
import { RateLimit } from "../../behaviors/rate-limit";
import { ServiceTime } from "../../behaviors/service-time";
import { distributionSchema } from "../../random/distribution";
import type { ComponentBehavior } from "../component-behavior";
import type {
  BuildContext,
  ComponentDefinition,
} from "../component-definition";

const apiGatewayConfig = z.object({
  /** Steady requests per second before throttling (HTTP 429). */
  ratePerSec: z.number().positive(),
  /** Requests that can arrive at once after a quiet period. */
  burst: z.number().int().min(1),
  /** API Gateway's own processing time per request, before the integration. */
  overhead: distributionSchema,
});
export type ApiGatewayConfig = z.infer<typeof apiGatewayConfig>;

/**
 * Amazon API Gateway (MVP design §3.2): a token bucket in front of a short
 * overhead. Defaults are the account-level limit per region: 10,000
 * requests/s with a burst of 5,000. In AWS that limit is shared by every API
 * in the account and Region (fidelity APIGW-1).
 */
export const apiGatewayDefinition: ComponentDefinition<ApiGatewayConfig> = {
  type: "api-gateway",
  displayName: "API Gateway",
  configSchema: apiGatewayConfig,
  defaultConfig: {
    ratePerSec: 10_000,
    burst: 5_000,
    overhead: { kind: "lognormal", medianMs: 10, p99Ms: 25 },
  },
  actions: ["invoke"],
  deliversAsync: false,
  build<T>(
    config: ApiGatewayConfig,
    { random }: BuildContext,
  ): ComponentBehavior<T> {
    const limit = new RateLimit({
      ratePerSec: config.ratePerSec,
      burst: config.burst,
    });
    const overhead = new ServiceTime(config.overhead, random);
    let inProgress = 0;
    return {
      arrive(request, _action, nowMs) {
        if (!limit.tryTake(nowMs)) {
          return [{ kind: "rejected", request, reason: "throttled" }];
        }
        inProgress++;
        return [{ kind: "started", request, serviceMs: overhead.next() }];
      },
      finish() {
        inProgress--;
        return [];
      },
      get inProgress() {
        return inProgress;
      },
      queueDepth: 0,
    };
  },
};
