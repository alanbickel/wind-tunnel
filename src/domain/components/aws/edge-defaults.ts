import type { EdgeSettings } from "../../model/edge-settings";

/**
 * A new edge's settings, from any AWS type that doesn't set its own: 1 ms
 * each way (ENG-1), a 5 s timeout (ENG-5), and one attempt, as the
 * templates write "no retries" (ENG-2). All three are assumptions:
 * fidelity's defaults table rates them, and API Gateway's timeout differs.
 */
export const AWS_EDGE_DEFAULTS: EdgeSettings = {
  latencyMs: 1,
  timeoutMs: 5_000,
  retry: { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
};
