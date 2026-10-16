/**
 * Admits requests up to a sustained rate and rejects the rest (MVP design
 * §3.1). `TokenBucket` is the implementation.
 */
export interface RateLimit {
  /** Takes a token at simulated time `nowMs`. Returns false when throttled. */
  tryTake(nowMs: number): boolean;
  /** Tokens available at `nowMs` (for metrics and tests). */
  available(nowMs: number): number;
}
