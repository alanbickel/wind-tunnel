import { describe, expect, it } from "vitest";
import type { RetryPolicy } from "../model/project";
import { SeededRandom } from "../random/random-source";
import { backoffMs, MAX_BACKOFF_MS } from "./backoff";

const policy = (backoff: RetryPolicy["backoff"]): RetryPolicy => ({
  maxAttempts: 10,
  backoff,
  baseDelayMs: 100,
});
const random = new SeededRandom(1);

describe("backoffMs", () => {
  it("waits the base delay every time with no backoff", () => {
    expect([1, 2, 3].map((n) => backoffMs(policy("none"), n, random))).toEqual([
      100, 100, 100,
    ]);
  });

  it("doubles the wait with exponential backoff, up to the cap", () => {
    expect(
      [1, 2, 3, 20].map((n) => backoffMs(policy("exponential"), n, random)),
    ).toEqual([100, 200, 400, MAX_BACKOFF_MS]);
  });

  it("waits a random share of the exponential value with jitter", () => {
    for (const n of [1, 2, 3, 4]) {
      const wait = backoffMs(policy("exponential-jitter"), n, random);
      expect(wait).toBeGreaterThanOrEqual(0);
      expect(wait).toBeLessThan(100 * 2 ** (n - 1));
    }
  });
});
