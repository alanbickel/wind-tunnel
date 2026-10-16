import type { AcquireResult, ConcurrencyLimit } from "./concurrency-limit";
import { Queue } from "./queue";

export interface CountingSemaphoreInput {
  /** At most this many holders at once. */
  limit: number;
  /**
   * What happens when all slots are taken:
   * - `reject`: the request fails right away (Lambda throttling, RDS
   *   "too many connections").
   * - `queue`: the request waits for a slot (RDS query workers).
   */
  whenFull: "reject" | "queue";
  /** Maximum waiters when `whenFull` is `queue`; unbounded if omitted. */
  queueCapacity?: number;
}

/**
 * At most N requests in progress (MVP design §3.1). Callers pass a token that
 * identifies the waiter, so `release` can say which waiter got the freed slot.
 */
export class CountingSemaphore<T> implements ConcurrencyLimit<T> {
  readonly limit: number;
  private readonly waiting: Queue<T> | undefined;
  private held = 0;

  constructor(input: CountingSemaphoreInput) {
    if (!(input.limit >= 0))
      throw new RangeError("Concurrency limit must be >= 0");
    this.limit = input.limit;
    this.waiting =
      input.whenFull === "queue"
        ? new Queue<T>(input.queueCapacity)
        : undefined;
  }

  /** Slots currently held. */
  get inUse(): number {
    return this.held;
  }

  /** Waiters queued for a slot. */
  get queued(): number {
    return this.waiting?.size ?? 0;
  }

  /**
   * Takes a slot for `waiter` if one is free. Otherwise queues or rejects it,
   * depending on `whenFull`. A queued waiter gets its slot from a later
   * `release` call.
   */
  acquire(waiter: T): AcquireResult {
    if (this.held < this.limit) {
      this.held++;
      return "admitted";
    }
    return this.waiting?.offer(waiter) === true ? "queued" : "rejected";
  }

  /**
   * Frees one slot. If a waiter is queued, the slot passes straight to it and
   * that waiter is returned; the caller must start its work.
   */
  release(): T | undefined {
    if (this.held === 0) throw new Error("release() called with no slots held");
    const next = this.waiting?.poll();
    if (next === undefined) this.held--;
    return next;
  }
}
