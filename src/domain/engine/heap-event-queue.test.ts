import { describe, expect, it } from "vitest";
import { SeededRandom } from "../random/random-source";
import type { EventQueue } from "./event-queue";
import { HeapEventQueue } from "./heap-event-queue";

const drain = <T>(queue: EventQueue<T>) => {
  const out: T[] = [];
  for (let event = queue.pop(); event !== undefined; event = queue.pop()) {
    out.push(event.payload);
  }
  return out;
};

describe("HeapEventQueue", () => {
  it("is empty when created", () => {
    const queue = new HeapEventQueue<string>();
    expect(queue.size).toBe(0);
    expect(queue.peek()).toBeUndefined();
    expect(queue.pop()).toBeUndefined();
  });

  it("pops events in time order", () => {
    const queue = new HeapEventQueue<string>();
    queue.schedule(30, "c");
    queue.schedule(10, "a");
    queue.schedule(20, "b");
    expect(queue.peek()?.payload).toBe("a");
    expect(drain(queue)).toEqual(["a", "b", "c"]);
  });

  it("pops events with the same time in the order they were scheduled", () => {
    const queue = new HeapEventQueue<string>();
    queue.schedule(5, "first");
    queue.schedule(1, "early");
    queue.schedule(5, "second");
    queue.schedule(5, "third");
    expect(drain(queue)).toEqual(["early", "first", "second", "third"]);
  });

  it("orders many random events correctly", () => {
    const random = new SeededRandom(3);
    const queue = new HeapEventQueue<number>();
    const times = Array.from({ length: 2_000 }, () =>
      Math.floor(random.next() * 100),
    );
    times.forEach((time, index) => {
      queue.schedule(time, index);
    });
    expect(queue.size).toBe(times.length);

    // Expected: sorted by time, ties by scheduling order (a stable sort).
    const expected = times
      .map((time, index) => ({ time, index }))
      .sort((a, b) => a.time - b.time)
      .map((e) => e.index);
    expect(drain(queue)).toEqual(expected);
  });

  it("keeps working when events are scheduled while draining", () => {
    const queue = new HeapEventQueue<string>();
    queue.schedule(10, "a");
    queue.schedule(30, "c");
    expect(queue.pop()?.payload).toBe("a");
    queue.schedule(20, "b");
    expect(drain(queue)).toEqual(["b", "c"]);
  });

  it("rejects non-finite times", () => {
    const queue = new HeapEventQueue<string>();
    expect(() => {
      queue.schedule(Number.NaN, "x");
    }).toThrow(RangeError);
    expect(() => {
      queue.schedule(Number.POSITIVE_INFINITY, "x");
    }).toThrow(RangeError);
  });
});
