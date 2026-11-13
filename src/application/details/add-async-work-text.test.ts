import { describe, expect, it } from "vitest";
import {
  addAsyncWorkText,
  emptiedSlotAnnouncement,
} from "./add-async-work-text";

describe("addAsyncWorkText", () => {
  // Fails if the words name an id, drop the queue or the consumer, or say
  // anything of an edge (async work never adds one).
  it("names the queue and the consumer, and nothing of an edge", () => {
    expect(
      addAsyncWorkText({
        queueName: "orders-queue",
        consumerName: "fn-writer",
      }),
    ).toEqual({
      undoName: "Add async work from orders-queue to fn-writer",
      announcement: "Added async work from orders-queue to fn-writer.",
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
