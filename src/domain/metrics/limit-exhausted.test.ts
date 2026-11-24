import { describe, expect, it } from "vitest";
import { TokenBucket } from "../behaviors/token-bucket";
import { limitExhausted } from "./limit-exhausted";

/** Whether `bucket` counts as exhausted, from its refusals since the start. */
const bucketExhausted = (bucket: TokenBucket) =>
  limitExhausted({ kind: "rate", refused: bucket.refused });

describe("limitExhausted", () => {
  // Fails if a concurrency limit counts as exhausted with a slot still free,
  // or not once every slot is held.
  it("exhausts a concurrency limit once every slot is held", () => {
    const at = (peak: number) =>
      limitExhausted({ kind: "concurrency", limit: 10, peak });
    expect([at(9), at(10)]).toEqual([false, true]);
  });

  // Fails if a bucket counts as exhausted only below one token left, as it
  // did before #314: this one refuses a 10-token request with 9 left.
  it("exhausts a bucket that refused a request with more than one token left", () => {
    const bucket = new TokenBucket({ ratePerSec: 1, burst: 20 });
    bucket.tryTake({ nowMs: 0, cost: 11 });
    expect(bucketExhausted(bucket)).toBe(false);
    expect(bucket.tryTake({ nowMs: 0, cost: 10 })).toBe(false);
    expect(bucket.available(0)).toBe(9);
    expect(bucketExhausted(bucket)).toBe(true);
  });

  // Fails if a bucket counts as exhausted without having refused a request:
  // this one still serves half-token requests with 0.75 left, under the one
  // token the rule asked for before #314.
  it("doesn't exhaust a bucket that still serves its requests", () => {
    const bucket = new TokenBucket({ ratePerSec: 1, burst: 2 });
    bucket.tryTake({ nowMs: 0, cost: 1.25 });
    expect(bucket.tryTake({ nowMs: 0, cost: 0.5 })).toBe(true);
    expect(bucket.available(0)).toBe(0.25);
    expect(bucketExhausted(bucket)).toBe(false);
  });
});
