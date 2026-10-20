import type { RateLimit } from "./rate-limit";

export interface TokenBucketInput {
  /** Tokens added per second: the sustained request rate. */
  ratePerSec: number;
  /** Bucket size: how many requests can arrive at once after a quiet period. */
  burst: number;
}

const TOKEN_EPSILON = 1e-9;

/**
 * Token bucket (MVP design §3.1). Each request takes one token; tokens refill
 * at a steady rate up to the burst size. With no token, the request is
 * rejected (for example API Gateway's HTTP 429).
 *
 * The bucket starts full and refills lazily, based on the simulated time
 * passed to `tryTake`, so it needs no timer events.
 */
export class TokenBucket implements RateLimit {
  readonly ratePerSec: number;
  readonly burst: number;
  private tokens: number;
  private tokensTaken = 0;
  private lastRefillMs = 0;

  constructor(input: TokenBucketInput) {
    if (!(input.ratePerSec >= 0))
      throw new RangeError("ratePerSec must be >= 0");
    if (!(input.burst >= 1)) throw new RangeError("burst must be >= 1");
    this.ratePerSec = input.ratePerSec;
    this.burst = input.burst;
    this.tokens = input.burst;
  }

  /** Takes a token at simulated time `nowMs`. Returns false when throttled. */
  tryTake(nowMs: number): boolean {
    this.refill(nowMs);
    // Refilling in fractional steps accumulates floating-point error, so a
    // bucket that should hold exactly 1 token may hold 0.9999999999. Without
    // the tolerance, every token would arrive a little late and the
    // sustained rate would fall short of `ratePerSec`.
    if (this.tokens < 1 - TOKEN_EPSILON) return false;
    this.tokens--;
    this.tokensTaken++;
    return true;
  }

  /** Tokens taken since the run began. */
  get taken(): number {
    return this.tokensTaken;
  }

  /** Tokens available at `nowMs` (for metrics and tests). */
  available(nowMs: number): number {
    this.refill(nowMs);
    return this.tokens;
  }

  private refill(nowMs: number): void {
    if (nowMs < this.lastRefillMs) {
      throw new RangeError("Time must not go backwards");
    }
    const elapsedSec = (nowMs - this.lastRefillMs) / 1000;
    this.tokens = Math.min(
      this.burst,
      this.tokens + elapsedSec * this.ratePerSec,
    );
    this.lastRefillMs = nowMs;
  }
}
