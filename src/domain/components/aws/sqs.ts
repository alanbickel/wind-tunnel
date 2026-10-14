import { z } from "zod";
import { Queue } from "../../behaviors/queue";
import { ServiceTime } from "../../behaviors/service-time";
import { distributionSchema } from "../../random/distribution";
import type { ComponentBehavior, Effect } from "../component-behavior";
import type {
  BuildContext,
  ComponentDefinition,
} from "../component-definition";

const sqsConfig = z.object({
  /**
   * The event source mapping's maximum concurrency: how many messages the
   * consumer works on at once. AWS allows 2 to 1,000.
   */
  consumerMaxConcurrency: z.number().int().min(2).max(1_000),
  /** Time for `SendMessage` to return to the sender. */
  sendLatency: distributionSchema,
});
export type SqsConfig = z.infer<typeof sqsConfig>;

/**
 * Amazon SQS standard queue with a Lambda consumer (MVP design §3.2).
 *
 * Sending is a short piece of work; the sender's request is done once it
 * finishes. The message then waits in an unbounded backlog until one of the
 * consumer's `consumerMaxConcurrency` slots is free, and is `dispatched` to
 * the step's `async` work. Batch size is 1.
 *
 * Simplification: a failed delivery goes straight to the back of the
 * backlog. Real SQS hides it until its visibility timeout ends (30 s by
 * default) and may move it to a dead-letter queue; both need a timer effect
 * (ADR-0006). See docs/design/fidelity.md: SQS-1, and SQS-3 for the
 * consumer reaching full concurrency at once.
 */
export const sqsDefinition: ComponentDefinition<SqsConfig> = {
  type: "sqs",
  displayName: "SQS",
  configSchema: sqsConfig,
  defaultConfig: {
    consumerMaxConcurrency: 10,
    sendLatency: { kind: "lognormal", medianMs: 10, p99Ms: 30 },
  },
  actions: ["enqueue"],
  deliversAsync: true,
  build<T>(config: SqsConfig, { random }: BuildContext): ComponentBehavior<T> {
    const backlog = new Queue<T>();
    const sendLatency = new ServiceTime(config.sendLatency, random);
    let sending = 0;
    let delivering = 0;
    const deliver = (): Effect<T>[] => {
      const effects: Effect<T>[] = [];
      while (delivering < config.consumerMaxConcurrency) {
        const request = backlog.poll();
        if (request === undefined) break;
        delivering++;
        effects.push({ kind: "dispatched", request });
      }
      return effects;
    };
    return {
      arrive(request) {
        sending++;
        return [{ kind: "started", request, serviceMs: sendLatency.next() }];
      },
      finish(request) {
        sending--;
        backlog.offer(request);
        return deliver();
      },
      dispatchFinished(request, succeeded) {
        delivering--;
        if (!succeeded) backlog.offer(request);
        return deliver();
      },
      get inProgress() {
        return sending;
      },
      get queueDepth() {
        return backlog.size;
      },
    };
  },
};
