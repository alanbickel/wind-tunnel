import { z } from "zod";
import { RateLimit } from "../../behaviors/rate-limit";
import { ServiceTime } from "../../behaviors/service-time";
import { distributionSchema } from "../../random/distribution";
import type {
  ArriveInput,
  ComponentBehavior,
  Effect,
} from "../component-behavior";
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
    context: BuildContext,
  ): ComponentBehavior<T> {
    return new ApiGatewayBehavior<T>(config, context);
  },
};

/** API Gateway's run-time state: its token bucket and requests in flight. */
class ApiGatewayBehavior<T> implements ComponentBehavior<T> {
  readonly queueDepth = 0;
  private readonly limit: RateLimit;
  private readonly overhead: ServiceTime;
  private running = 0;

  constructor(config: ApiGatewayConfig, { random }: BuildContext) {
    // eslint-disable-next-line no-restricted-syntax -- moves to a factory in R2.8 (ADR-0009)
    this.limit = new RateLimit({
      ratePerSec: config.ratePerSec,
      burst: config.burst,
    });
    // eslint-disable-next-line no-restricted-syntax -- moves to a factory in R2.8 (ADR-0009)
    this.overhead = new ServiceTime(config.overhead, random);
  }

  get inProgress(): number {
    return this.running;
  }

  arrive({ request, nowMs }: ArriveInput<T>): Effect<T>[] {
    if (!this.limit.tryTake(nowMs)) {
      return [{ kind: "rejected", request, reason: "throttled" }];
    }
    this.running++;
    return [{ kind: "started", request, serviceMs: this.overhead.next() }];
  }

  finish(): Effect<T>[] {
    this.running--;
    return [];
  }
}
