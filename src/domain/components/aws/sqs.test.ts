import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../random/random-source";
import { checkComponentContract } from "../check-component-contract";
import { sqsDefinition } from "./sqs";

const build = () =>
  sqsDefinition.build<string>(
    {
      consumerMaxConcurrency: 2,
      sendLatency: { kind: "constant", valueMs: 10 },
    },
    { random: new SeededRandom(1) },
  );

describe("sqsDefinition", () => {
  it("passes the component contract", () => {
    const report = checkComponentContract(sqsDefinition);
    expect(report.violations).toEqual([]);
    expect(report.stats.dispatched).toBeGreaterThan(0);
  });

  it("finishes the send, then dispatches up to the consumer's limit", () => {
    const queue = build();
    for (const m of ["m1", "m2", "m3"]) {
      expect(queue.arrive({ request: m, action: "enqueue", nowMs: 0 })).toEqual(
        [{ kind: "started", request: m, serviceMs: 10 }],
      );
    }
    expect(queue.finish({ request: "m1", nowMs: 10 })).toEqual([
      { kind: "dispatched", request: "m1" },
    ]);
    expect(queue.finish({ request: "m2", nowMs: 10 })).toEqual([
      { kind: "dispatched", request: "m2" },
    ]);
    expect(queue.finish({ request: "m3", nowMs: 10 })).toEqual([]);
    expect([queue.inProgress, queue.queueDepth]).toEqual([0, 1]);
  });

  it("puts a failed delivery at the back of the backlog", () => {
    const queue = build();
    for (const m of ["m1", "m2", "m3"]) {
      queue.arrive({ request: m, action: "enqueue", nowMs: 0 });
      queue.finish({ request: m, nowMs: 10 });
    }
    expect(
      queue.dispatchFinished?.({ request: "m1", succeeded: false, nowMs: 50 }),
    ).toEqual([{ kind: "dispatched", request: "m3" }]);
    expect(
      queue.dispatchFinished?.({ request: "m2", succeeded: true, nowMs: 60 }),
    ).toEqual([{ kind: "dispatched", request: "m1" }]);
    expect(queue.queueDepth).toBe(0);
  });

  it("allows a maximum concurrency of 2 to 1,000, as AWS does", () => {
    const parses = (consumerMaxConcurrency: number) =>
      sqsDefinition.configSchema.safeParse({
        ...sqsDefinition.defaultConfig,
        consumerMaxConcurrency,
      }).success;
    expect([parses(1), parses(2), parses(1_000), parses(1_001)]).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });
});
