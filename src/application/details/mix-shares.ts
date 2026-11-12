/** The total of a mix's shares, in tenths of a percent: 100.0%. */
export const SHARES_TOTAL_TENTHS = 1000;

/**
 * Each mix entry's share of the total weight, in tenths of a percent
 * (800 is 80.0%), so that they add up to exactly 100.0%: each share is
 * rounded down to a tenth, and the tenths left over go one each to the
 * entries with the largest remainders, the earlier entry winning a tie.
 * A weight that isn't positive counts as none, as the run's own checks
 * refuse it. Undefined when no entry has a positive weight, an empty mix
 * included: there's nothing to divide.
 */
export function mixShares(
  weights: readonly number[],
): readonly number[] | undefined {
  const positive = weights.map((weight) => (weight > 0 ? weight : 0));
  const total = positive.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) return undefined;
  const exact = positive.map((weight) => {
    const tenths = (weight * SHARES_TOTAL_TENTHS) / total;
    return { floor: Math.floor(tenths), remainder: tenths % 1 };
  });
  const floors = exact.reduce((sum, { floor }) => sum + floor, 0);
  const extra = new Set(
    largestRemainders(
      exact.map(({ remainder }) => remainder),
      SHARES_TOTAL_TENTHS - floors,
    ),
  );
  return exact.map(({ floor }, index) => floor + (extra.has(index) ? 1 : 0));
}

/** The indexes of the `count` largest remainders; the earlier index wins a tie. */
function largestRemainders(
  remainders: readonly number[],
  count: number,
): number[] {
  return remainders
    .map((remainder, index) => ({ remainder, index }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .slice(0, count)
    .map(({ index }) => index);
}

/** A share as it's shown: 334 is "33.4%". */
export function shareText(tenths: number): string {
  return `${(tenths / 10).toFixed(1)}%`;
}
