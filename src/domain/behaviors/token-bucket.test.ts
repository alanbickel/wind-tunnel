import { describe, expect, it } from "vitest";
import type { RateLimit } from "./rate-limit";
import { TokenBucket } from "./token-bucket";

const takeOne = (limit: RateLimit, nowMs: number) =>
  limit.tryTake({ nowMs, cost: 1 });

const takeMany = (limit: RateLimit, nowMs: number, count: number) =>
  Array.from({ length: count }, () => takeOne(limit, nowMs)).filter(Boolean)
    .length;

describe("TokenBucket", () => {
  it("allows a burst up to the bucket size, then throttles", () => {
    const limit = new TokenBucket({ ratePerSec: 10, burst: 5 });
    expect(takeMany(limit, 0, 8)).toBe(5);
  });

  it("refills at the steady rate", () => {
    const limit = new TokenBucket({ ratePerSec: 10, burst: 5 });
    takeMany(limit, 0, 5);
    expect(takeOne(limit, 50)).toBe(false); // half a token so far
    expect(takeOne(limit, 100)).toBe(true); // one token after 100 ms
    expect(takeOne(limit, 100)).toBe(false);
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
      if (takeOne(limit, ms)) admitted++;
    }
    // One initial token plus 100/s for 10 s. Refilling in 0.1-token steps
    // drifts in floating point; this catches the rate falling short.
    expect(admitted).toBe(1001);
  });

  // Fails if `taken` counts throttled requests too, or isn't counted at all.
  it("counts the tokens taken, not the requests throttled", () => {
    const limit = new TokenBucket({ ratePerSec: 10, burst: 5 });
    takeMany(limit, 0, 8);
    // Refilled to the burst size again after a second: 5 more.
    takeMany(limit, 1_000, 20);
    expect(limit.taken).toBe(10);
  });

  it("rejects time going backwards", () => {
    const limit = new TokenBucket({ ratePerSec: 1, burst: 1 });
    takeOne(limit, 100);
    expect(() => takeOne(limit, 50)).toThrow(RangeError);
  });

  // Fails if a request is let in on any token rather than its whole cost,
  // or a refused one still takes what's left.
  it("refuses a request costing more than the bucket holds, taking nothing", () => {
    const limit = new TokenBucket({ ratePerSec: 10, burst: 5 });
    expect(limit.tryTake({ nowMs: 0, cost: 3 })).toBe(true);
    expect(limit.tryTake({ nowMs: 0, cost: 3 })).toBe(false);
    expect(limit.available(0)).toBe(2);
    expect(limit.tryTake({ nowMs: 0, cost: 6 })).toBe(false);
    expect(limit.taken).toBe(3);
  });

  // Fails if `refused` counts the requests let in, sums the refused costs,
  // or misses a refusal.
  it("counts the requests it refuses", () => {
    const limit = new TokenBucket({ ratePerSec: 10, burst: 5 });
    limit.tryTake({ nowMs: 0, cost: 3 });
    expect(limit.refused).toBe(0);
    limit.tryTake({ nowMs: 0, cost: 3 });
    limit.tryTake({ nowMs: 0, cost: 2.5 });
    limit.tryTake({ nowMs: 0, cost: 2 });
    expect(limit.refused).toBe(2);
  });

  // Fails if a cost is rounded up to a whole token, so two half-token
  // requests drain two tokens.
  it("takes a fractional cost", () => {
    const limit = new TokenBucket({ ratePerSec: 10, burst: 1 });
    expect(limit.tryTake({ nowMs: 0, cost: 0.5 })).toBe(true);
    expect(limit.tryTake({ nowMs: 0, cost: 0.5 })).toBe(true);
    expect(limit.tryTake({ nowMs: 0, cost: 0.5 })).toBe(false);
    // Half a token back after 50 ms at 10/s.
    expect(limit.tryTake({ nowMs: 50, cost: 0.5 })).toBe(true);
  });

  // Fails if `taken` counts requests rather than adding up their costs.
  it("sums the costs taken", () => {
    const limit = new TokenBucket({ ratePerSec: 10, burst: 5 });
    limit.tryTake({ nowMs: 0, cost: 0.5 });
    limit.tryTake({ nowMs: 0, cost: 2 });
    limit.tryTake({ nowMs: 0, cost: 4 }); // refused: 2.5 left
    limit.tryTake({ nowMs: 0, cost: 1.5 });
    expect(limit.taken).toBe(4);
  });

  // Fails if a cost of zero, a negative one, or NaN is let through, which
  // would admit requests for free or refill the bucket.
  it.each([0, -1, Number.NaN, Infinity])("rejects a cost of %s", (cost) => {
    const limit = new TokenBucket({ ratePerSec: 1, burst: 1 });
    expect(() => limit.tryTake({ nowMs: 0, cost })).toThrow(RangeError);
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
