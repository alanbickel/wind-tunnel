import { describe, expect, it } from "vitest";
import {
  addAsyncWorkText,
  emptiedSlotAnnouncement,
} from "./add-async-work-text";

describe("addAsyncWorkText", () => {
  // Fails if the words name an id, drop the queue or the consumer, or say
  // an edge was added when none was.
  it("names the queue and the consumer, and the edge only when one is added", () => {
    const input = { queueName: "orders-queue", consumerName: "fn-writer" };

    expect(addAsyncWorkText({ ...input, addsEdge: false })).toEqual({
      undoName: "Add async work from orders-queue to fn-writer",
      announcement: "Added async work from orders-queue to fn-writer.",
    });
    expect(addAsyncWorkText({ ...input, addsEdge: true })).toEqual({
      undoName: "Add async work from orders-queue to fn-writer, and its edge",
      announcement:
        "Added async work from orders-queue to fn-writer. Added the edge from orders-queue to fn-writer.",
    });
  });
});

describe("emptiedSlotAnnouncement", () => {
  // Fails if removing the async root doesn't say the queue has none now.
  it("says what went and that the queue has no async work now", () => {
    expect(
      emptiedSlotAnnouncement({
        removedLabel: "fn-writer · invoke",
        queueLabel: "orders-queue · enqueue",
      }),
    ).toBe(
      "Removed fn-writer · invoke. orders-queue · enqueue has no async work now.",
    );
  });
});
