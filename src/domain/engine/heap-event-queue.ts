import type { EventQueue, ScheduledEvent } from "./event-queue";

/**
 * An `EventQueue` implemented as a binary min-heap: schedule and pop are
 * O(log n). Each event gets a sequence number to break ties.
 */
export class HeapEventQueue<T> implements EventQueue<T> {
  private readonly heap: ScheduledEvent<T>[] = [];
  private nextSequence = 0;

  get size(): number {
    return this.heap.length;
  }

  schedule(timeMs: number, payload: T): void {
    if (!Number.isFinite(timeMs)) {
      throw new RangeError(`Event time must be finite, got ${String(timeMs)}`);
    }
    this.heap.push({ timeMs, sequence: this.nextSequence++, payload });
    this.siftUp(this.heap.length - 1);
  }

  /** The earliest event, without removing it. */
  peek(): ScheduledEvent<T> | undefined {
    return this.heap[0];
  }

  /** Removes and returns the earliest event. */
  pop(): ScheduledEvent<T> | undefined {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (top === undefined || last === undefined) return undefined;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(index: number): void {
    let child = index;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (!this.before(child, parent)) return;
      this.swap(child, parent);
      child = parent;
    }
  }

  private siftDown(index: number): void {
    let parent = index;
    for (;;) {
      const left = 2 * parent + 1;
      const right = left + 1;
      let smallest = parent;
      if (left < this.heap.length && this.before(left, smallest))
        smallest = left;
      if (right < this.heap.length && this.before(right, smallest))
        smallest = right;
      if (smallest === parent) return;
      this.swap(parent, smallest);
      parent = smallest;
    }
  }

  /** Whether the event at index `a` is due before the event at index `b`. */
  private before(a: number, b: number): boolean {
    const x = this.at(a);
    const y = this.at(b);
    return (
      x.timeMs < y.timeMs || (x.timeMs === y.timeMs && x.sequence < y.sequence)
    );
  }

  private swap(a: number, b: number): void {
    const x = this.at(a);
    this.heap[a] = this.at(b);
    this.heap[b] = x;
  }

  private at(index: number): ScheduledEvent<T> {
    const event = this.heap[index];
    if (event === undefined)
      throw new RangeError(`No event at index ${String(index)}`);
    return event;
  }
}
