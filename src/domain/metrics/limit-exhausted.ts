import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import type { ConcurrencyLimitUse, RateLimitUse } from "./metrics-snapshot";

/** What `limitExhausted` reads of a limit's use, by kind. */
export type LimitExhaustion =
  | Pick<ConcurrencyLimitUse, "kind" | "limit" | "peak">
  | Pick<RateLimitUse, "kind" | "refused">;

/**
 * Whether a limit ran out in a window (or in a run, from its totals), by
 * its kind's rule:
 *
 * - concurrency: every slot was held at the peak (`peak >= limit`);
 * - rate: the bucket refused a request, finding less than its cost left
 *   (`refused > 0`).
 *
 * A request arriving then had to wait or was rejected. A bucket's rule
 * reads what the bucket did, not its level, because what a request costs
 * varies (#314): a 40 KB strongly consistent DynamoDB read costing 10 units
 * is refused with 9 left, and a default read costing half a unit is still
 * served with 0.7. So a bucket can run out well short of `peak / limit` = 1.
 */
export function limitExhausted(use: LimitExhaustion): boolean {
  return handleKind(EXHAUSTED, use);
}

const EXHAUSTED: KindHandlers<LimitExhaustion, boolean> = {
  concurrency: ({ limit, peak }) => peak >= limit,
  rate: ({ refused }) => refused > 0,
};
