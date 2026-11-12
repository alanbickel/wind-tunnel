import { describe, expect, it } from "vitest";
import { mixShares, shareText, SHARES_TOTAL_TENTHS } from "./mix-shares";

/** The shares' sum, in tenths of a percent. */
function total(shares: readonly number[] | undefined): number | undefined {
  return shares?.reduce((sum, tenths) => sum + tenths, 0);
}

describe("mixShares", () => {
  // Fails if the shares are rounded one by one, so a mix such as 80/20 or
  // three equal weights doesn't come to exactly 100.0%.
  it.each([
    { name: "80/20", weights: [80, 20], shares: [800, 200] },
    { name: "three equal", weights: [1, 1, 1], shares: [334, 333, 333] },
    {
      name: "a tiny weight beside a huge one",
      weights: [1, 1_000_000_000],
      shares: [0, 1000],
    },
  ])("adds up to exactly 100.0% for $name", ({ weights, shares }) => {
    const result = mixShares(weights);

    expect(total(result)).toBe(SHARES_TOTAL_TENTHS);
    expect(result).toEqual(shares);
  });

  // Fails if the last tenths go by position rather than by largest
  // remainder, so the weights' order changes which entry gets one, or the sum.
  it("adds up the same whatever order the weights come in", () => {
    const weights = [7, 13, 29, 51, 3];

    const sums = [weights, [...weights].reverse(), [3, 29, 7, 51, 13]].map(
      (order) => total(mixShares(order)),
    );

    expect(sums).toEqual([1000, 1000, 1000]);
  });

  // Fails if the largest remainder doesn't win the extra tenth: 2/3 and
  // 1/3 of 1000 are 666.67 and 333.33, so the first gets it.
  it("gives the leftover tenths to the largest remainders", () => {
    expect(mixShares([2, 1])).toEqual([667, 333]);
  });

  // Fails if an empty mix, or one with no positive weight, divides by zero
  // and shows NaN, instead of having no shares.
  it("is undefined when there's nothing to divide", () => {
    expect(mixShares([])).toBeUndefined();
    expect(mixShares([0, -5])).toBeUndefined();
  });

  // Fails if a non-positive weight takes a share from the entries that run,
  // so the shown shares stop adding up or a negative share shows.
  it("counts a weight that isn't positive as none", () => {
    const shares = mixShares([3, -1, 1]);

    expect(shares).toEqual([750, 0, 250]);
    expect(total(shares)).toBe(1000);
  });
});

describe("shareText", () => {
  // Fails if a share isn't shown to one decimal place, so 80.0% reads 80%.
  it("shows tenths of a percent", () => {
    expect(shareText(800)).toBe("80.0%");
    expect(shareText(334)).toBe("33.4%");
    expect(shareText(0)).toBe("0.0%");
  });
});
