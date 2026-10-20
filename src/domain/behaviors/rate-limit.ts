/**
 * Admits requests up to a sustained rate and rejects the rest (MVP design
 * §3.1). `TokenBucket` is the implementation.
 */
export interface RateLimit {
  /** Tokens added per second: the sustained rate. */
  readonly ratePerSec: number;
  /** Most tokens the bucket holds: how many requests can arrive at once. */
  readonly burst: number;
  /** Tokens taken since the run began. Never decreases. */
  readonly taken: number;
  /** Takes a token at simulated time `nowMs`. Returns false when throttled. */
  tryTake(nowMs: number): boolean;
  /** Tokens available at `nowMs` (for metrics and tests). */
  available(nowMs: number): number;
}
