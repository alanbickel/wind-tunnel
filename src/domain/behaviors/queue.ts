/**
 * FIFO buffer, optionally bounded. Unbounded queues model SQS; bounded ones
 * model wait lines in front of a limited resource.
 */
export class Queue<T> {
  private items: T[] = [];
  /** Index of the oldest item; avoids O(n) `Array.shift` on every poll. */
  private head = 0;
  readonly capacity: number;

  /** @param capacity Maximum items held; omit for an unbounded queue. */
  constructor(capacity = Number.POSITIVE_INFINITY) {
    if (!(capacity >= 0)) throw new RangeError("Queue capacity must be >= 0");
    this.capacity = capacity;
  }

  get size(): number {
    return this.items.length - this.head;
  }

  /** Adds `item` to the back. Returns false (and drops it) when full. */
  offer(item: T): boolean {
    if (this.size >= this.capacity) return false;
    this.items.push(item);
    return true;
  }

  /** Removes and returns the oldest item. */
  poll(): T | undefined {
    if (this.size === 0) return undefined;
    const item = this.items[this.head];
    this.head++;
    // Reclaim the consumed prefix once it is at least half the array.
    if (this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return item;
  }
}
