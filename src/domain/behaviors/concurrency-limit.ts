export type AcquireResult = "admitted" | "queued" | "rejected";

/**
 * At most N requests in progress (MVP design §3.1); the rest are queued or
 * rejected. `CountingSemaphore` is the implementation. Callers pass a token
 * that identifies the waiter, so `release` can say which waiter got the
 * freed slot.
 */
export interface ConcurrencyLimit<T> {
  /** At most this many slots held at once. */
  readonly limit: number;
  /** Slots currently held. */
  readonly inUse: number;
  /** Waiters queued for a slot. */
  readonly queued: number;
  /** Takes a slot for `waiter`, or queues or rejects it. */
  acquire(waiter: T): AcquireResult;
  /**
   * Frees one slot. If a waiter is queued, the slot passes straight to it and
   * that waiter is returned; the caller must start its work.
   */
  release(): T | undefined;
}
