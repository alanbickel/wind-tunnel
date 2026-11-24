import { TOKEN_EPSILON } from "../behaviors/token-bucket";
import type { LimitUse } from "./metrics-snapshot";

/** A limit and the most of it used at once, in its unit. */
export type LimitAtPeak = Pick<LimitUse, "kind" | "limit" | "peak">;

/**
 * Whether a limit ran out at its peak, by its kind's rule:
 *
 * - concurrency: every slot was held (`peak >= limit`);
 * - rate: the bucket held less than one token (`peak > limit - 1`), the
 *   level at which the bucket throttles.
 *
 * The rate rule assumes a request costs one token, so it's wrong both ways
 * for other costs (#314): one that costs more, such as a large DynamoDB
 * item, can be refused with more left, and one that costs half a token,
 * such as a default DynamoDB read, is still served with less.
 *
 * A request arriving then had to wait or was rejected. A bucket can run out
 * well short of `peak / limit` = 1: one with a burst of 2 is out at 1.1
 * tokens drawn.
 */
export function limitExhausted(use: LimitAtPeak): boolean {
  return EXHAUSTED[use.kind](use);
}

const EXHAUSTED: Readonly<
  Record<LimitUse["kind"], (use: LimitAtPeak) => boolean>
> = {
  concurrency: ({ limit, peak }) => peak >= limit,
  rate: ({ limit, peak }) => limit - peak < 1 - TOKEN_EPSILON,
};
