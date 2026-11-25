import { describe, expect, it } from "vitest";
import type { BackoffStrategy } from "../model/project";
import { SeededRandom } from "../random/seeded-random";
import { backoffMs, MAX_BACKOFF_MS } from "./backoff";
import type { ResolvedRetryPolicy } from "./resolve-retry";

/** A policy waiting from 100 ms after a transient error, 1,000 after a throttle. */
const policy = (backoff: BackoffStrategy): ResolvedRetryPolicy => ({
  maxAttempts: 10,
  backoff,
  baseDelayMs: { throttling: 1_000, transient: 100 },
});
const kind = "transient";
const random = new SeededRandom(1);

describe("backoffMs", () => {
  it("waits the base delay every time with no backoff", () => {
    expect(
      [1, 2, 3].map((n) =>
        backoffMs({ policy: policy("none"), kind, failedAttempts: n, random }),
      ),
    ).toEqual([100, 100, 100]);
  });

  it("doubles the wait with exponential backoff, up to the cap", () => {
    expect(
      [1, 2, 3, 20].map((n) =>
        backoffMs({
          policy: policy("exponential"),
          kind,
          failedAttempts: n,
          random,
        }),
      ),
    ).toEqual([100, 200, 400, MAX_BACKOFF_MS]);
  });

  it("waits a random share of the exponential value with jitter", () => {
    for (const n of [1, 2, 3, 4]) {
      const wait = backoffMs({
        policy: policy("exponential-jitter"),
        kind,
        failedAttempts: n,
        random,
      });
      expect(wait).toBeGreaterThanOrEqual(0);
      expect(wait).toBeLessThan(100 * 2 ** (n - 1));
    }
  });

  // Fails if backoffMs reads one base delay whatever the failure's kind,
  // e.g. always the transient one.
  it("grows from the base delay for the failure's kind", () => {
    const waits = (["throttling", "transient"] as const).map((k) =>
      backoffMs({
        policy: policy("exponential"),
        kind: k,
        failedAttempts: 2,
        random,
      }),
    );
    expect(waits).toEqual([2_000, 200]);
  });
});
