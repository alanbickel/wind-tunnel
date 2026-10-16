import { describe, expect, it } from "vitest";
import { CountingSemaphore } from "./counting-semaphore";

describe("CountingSemaphore", () => {
  describe("when full, rejects", () => {
    it("admits up to the limit, then rejects", () => {
      const limit = new CountingSemaphore<string>({
        limit: 2,
        whenFull: "reject",
      });
      expect(limit.acquire("a")).toBe("admitted");
      expect(limit.acquire("b")).toBe("admitted");
      expect(limit.acquire("c")).toBe("rejected");
      expect(limit.inUse).toBe(2);
      expect(limit.queued).toBe(0);
    });

    it("frees a slot on release", () => {
      const limit = new CountingSemaphore<string>({
        limit: 1,
        whenFull: "reject",
      });
      limit.acquire("a");
      expect(limit.release()).toBeUndefined();
      expect(limit.inUse).toBe(0);
      expect(limit.acquire("b")).toBe("admitted");
    });
  });

  describe("when full, queues", () => {
    it("queues waiters and hands freed slots to them in order", () => {
      const limit = new CountingSemaphore<string>({
        limit: 1,
        whenFull: "queue",
      });
      expect(limit.acquire("a")).toBe("admitted");
      expect(limit.acquire("b")).toBe("queued");
      expect(limit.acquire("c")).toBe("queued");
      expect(limit.queued).toBe(2);

      expect(limit.release()).toBe("b");
      expect(limit.inUse).toBe(1); // the slot passed to b; it was never free
      expect(limit.release()).toBe("c");
      expect(limit.release()).toBeUndefined();
      expect(limit.inUse).toBe(0);
    });

    it("rejects when the wait queue is full", () => {
      const limit = new CountingSemaphore<string>({
        limit: 1,
        whenFull: "queue",
        queueCapacity: 1,
      });
      limit.acquire("a");
      expect(limit.acquire("b")).toBe("queued");
      expect(limit.acquire("c")).toBe("rejected");
    });
  });

  it("rejects everything with a limit of zero", () => {
    const limit = new CountingSemaphore<string>({
      limit: 0,
      whenFull: "reject",
    });
    expect(limit.acquire("a")).toBe("rejected");
  });

  it("throws when releasing more than was acquired", () => {
    const limit = new CountingSemaphore<string>({
      limit: 1,
      whenFull: "reject",
    });
    expect(() => limit.release()).toThrow();
  });
});
