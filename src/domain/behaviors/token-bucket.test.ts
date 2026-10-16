import { describe, expect, it } from "vitest";
import type { RateLimit } from "./rate-limit";
import { TokenBucket } from "./token-bucket";

const takeMany = (limit: RateLimit, nowMs: number, count: number) =>
  Array.from({ length: count }, () => limit.tryTake(nowMs)).filter(Boolean)
    .length;

describe("TokenBucket", () => {
  it("allows a burst up to the bucket size, then throttles", () => {
    const limit = new TokenBucket({ ratePerSec: 10, burst: 5 });
    expect(takeMany(limit, 0, 8)).toBe(5);
  });

  it("refills at the steady rate", () => {
    const limit = new TokenBucket({ ratePerSec: 10, burst: 5 });
    takeMany(limit, 0, 5);
    expect(limit.tryTake(50)).toBe(false); // half a token so far
    expect(limit.tryTake(100)).toBe(true); // one token after 100 ms
    expect(limit.tryTake(100)).toBe(false);
    expect(takeMany(limit, 400, 10)).toBe(3);
  });

  it("never holds more than the burst size", () => {
    const limit = new TokenBucket({ ratePerSec: 1000, burst: 5 });
    expect(limit.available(60_000)).toBe(5);
  });

  it("sustains its rate over a long period", () => {
    const limit = new TokenBucket({ ratePerSec: 100, burst: 1 });
    let admitted = 0;
    for (let ms = 0; ms <= 10_000; ms++) {
      if (limit.tryTake(ms)) admitted++;
    }
    // One initial token plus 100/s for 10 s. Refilling in 0.1-token steps
    // drifts in floating point; this catches the rate falling short.
    expect(admitted).toBe(1001);
  });

  it("rejects time going backwards", () => {
    const limit = new TokenBucket({ ratePerSec: 1, burst: 1 });
    limit.tryTake(100);
    expect(() => limit.tryTake(50)).toThrow(RangeError);
  });

  it("rejects invalid options", () => {
    expect(() => new TokenBucket({ ratePerSec: -1, burst: 1 })).toThrow(
      RangeError,
    );
    expect(() => new TokenBucket({ ratePerSec: 1, burst: 0 })).toThrow(
      RangeError,
    );
  });
});
