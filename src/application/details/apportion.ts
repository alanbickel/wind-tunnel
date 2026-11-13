/**
 * Divides `totalUnits` whole units among entries in proportion to their
 * weights, so the parts add up to exactly `totalUnits`: each part is rounded
 * down, and the units left over go one each to the entries with the largest
 * remainders, the earlier entry winning a tie (the largest-remainder rule).
 * A weight that isn't positive counts as none. Undefined when no entry has a
 * positive weight, an empty list included: there's nothing to divide.
 */
export function apportion(
  weights: readonly number[],
  totalUnits: number,
): readonly number[] | undefined {
  const positive = weights.map((weight) => (weight > 0 ? weight : 0));
  const total = positive.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) return undefined;
  const exact = positive.map((weight) => {
    const units = (weight * totalUnits) / total;
    return { floor: Math.floor(units), remainder: units % 1 };
  });
  const floors = exact.reduce((sum, { floor }) => sum + floor, 0);
  const extra = new Set(
    largestRemainders(
      exact.map(({ remainder }) => remainder),
      totalUnits - floors,
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
