import { z } from "zod";
import { distributionSchema } from "../../random/distribution";
import type { RefuseWhenFull } from "../component-behavior";
import { rateLimitedServiceDefinition } from "../rate-limited-service";
import { AWS_EDGE_DEFAULTS } from "./edge-defaults";

const apiGatewayConfig = z.object({
  /** Steady requests per second before throttling (HTTP 429). */
  ratePerSec: z.number().positive(),
  /** Requests that can arrive at once after a quiet period. */
  burst: z.number().int().min(1),
  /** API Gateway's own processing time per request, before the integration. */
  overhead: distributionSchema,
});
export type ApiGatewayConfig = z.infer<typeof apiGatewayConfig>;

/** Rejects a request that finds less than one token in the bucket. */
const THROTTLED: RefuseWhenFull = { kind: "refuse", reason: "throttled" };

/**
 * Amazon API Gateway (MVP design §3.2): a token bucket in front of a short
 * overhead. Defaults are the account-level limit per region: 10,000
 * requests/s with a burst of 5,000. In AWS that limit is shared by every API
 * in the account and Region (fidelity APIGW-1).
 */
export const apiGatewayDefinition = rateLimitedServiceDefinition({
  type: "api-gateway",
  displayName: "API Gateway",
  configSchema: apiGatewayConfig,
  defaultConfig: {
    ratePerSec: 10_000,
    burst: 5_000,
    overhead: { kind: "lognormal", medianMs: 10, p99Ms: 25 },
  },
  // A REST API waits up to 29 s for its integration (ENG-5).
  edgeDefaults: { ...AWS_EDGE_DEFAULTS, timeoutMs: 29_000 },
  refusal: THROTTLED,
  // A 429 Too Many Requests (ADR-0025 decision 7).
  refusalKind: "throttling",
  limits: {
    requestRate: ({ ratePerSec, burst }) => ({ ratePerSec, burst }),
  },
  actions: { invoke: { limit: "requestRate", serviceTime: "overhead" } },
});
