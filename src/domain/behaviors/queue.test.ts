import { describe, expect, it } from "vitest";
import { Queue } from "./queue";

describe("Queue", () => {
  it("returns items in first-in, first-out order", () => {
    const queue = new Queue<number>();
    queue.offer(1);
    queue.offer(2);
    queue.offer(3);
    expect([queue.poll(), queue.poll(), queue.poll()]).toEqual([1, 2, 3]);
    expect(queue.poll()).toBeUndefined();
    expect(queue.size).toBe(0);
  });

  it("is unbounded by default", () => {
    const queue = new Queue<number>();
    for (let i = 0; i < 10_000; i++) expect(queue.offer(i)).toBe(true);
    expect(queue.size).toBe(10_000);
  });

  it("rejects items when a bounded queue is full", () => {
    const queue = new Queue<string>(2);
    expect(queue.offer("a")).toBe(true);
    expect(queue.offer("b")).toBe(true);
    expect(queue.offer("c")).toBe(false);
    expect(queue.size).toBe(2);
    queue.poll();
    expect(queue.offer("c")).toBe(true);
    expect([queue.poll(), queue.poll()]).toEqual(["b", "c"]);
  });

  it("keeps order across interleaved offers and polls", () => {
    const queue = new Queue<number>();
    const out: (number | undefined)[] = [];
    let next = 0;
    for (let round = 0; round < 100; round++) {
      for (let i = 0; i < 3; i++) queue.offer(next++);
      for (let i = 0; i < 2; i++) out.push(queue.poll());
    }
    while (queue.size > 0) out.push(queue.poll());
    expect(out).toEqual(Array.from({ length: next }, (_, i) => i));
  });

  it("rejects a negative capacity", () => {
    expect(() => new Queue(-1)).toThrow(RangeError);
  });
});
