/** One request's draw on a rate limit. */
export interface TakeInput {
  /** The current simulated time. */
  readonly nowMs: number;
  /**
   * Tokens the request uses: any positive number, such as half a DynamoDB
   * read unit. A request costing more than the burst is always refused.
   */
  readonly cost: number;
}

/**
 * Admits requests up to a sustained rate and rejects the rest (MVP design
 * §3.1). `TokenBucket` is the implementation.
 */
export interface RateLimit {
  /** Tokens added per second: the sustained rate. */
  readonly ratePerSec: number;
  /**
   * Most tokens the bucket holds: how much can be taken at once. It must
   * hold the largest cost a request can have, or that request is refused
   * for ever.
   */
  readonly burst: number;
  /** Tokens taken since the run began: the sum of the costs. Never decreases. */
  readonly taken: number;
  /**
   * Requests refused since the run began, because the bucket held less than
   * their cost. Never decreases. A bucket ran out in a stretch of time if
   * this grew during it, whatever the requests cost (ADR-0014).
   */
  readonly refused: number;
  /**
   * Takes the request's `cost` in tokens at `nowMs`. Returns false, and
   * takes nothing, when the bucket holds less than the cost: throttled.
   */
  tryTake(input: TakeInput): boolean;
  /**
   * Tokens available at `nowMs`, between 0 and `burst`. Only reads: the
   * metrics call it after every request, and reading mustn't change when
   * later requests get a token.
   */
  available(nowMs: number): number;
}
