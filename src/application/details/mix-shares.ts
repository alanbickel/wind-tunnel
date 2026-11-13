import { apportion } from "./apportion";

/** The total of a mix's shares, in tenths of a percent: 100.0%. */
export const SHARES_TOTAL_TENTHS = 1000;

/**
 * Each mix entry's share of the total weight, in tenths of a percent
 * (800 is 80.0%), so that they add up to exactly 100.0%: the largest-remainder
 * rule of `apportion`, over 1000 tenths. A weight that isn't positive counts
 * as none, as the run's own checks refuse it. Undefined when no entry has a
 * positive weight, an empty mix included: there's nothing to divide.
 */
export function mixShares(
  weights: readonly number[],
): readonly number[] | undefined {
  return apportion(weights, SHARES_TOTAL_TENTHS);
}

/** A share as it's shown: 334 is "33.4%". */
export function shareText(tenths: number): string {
  return `${(tenths / 10).toFixed(1)}%`;
}
