import { z } from "zod";
import { Queue } from "../../behaviors/queue";
import { ServiceTime } from "../../behaviors/service-time";
import { distributionSchema } from "../../random/distribution";
import type {
  ArriveInput,
  ComponentBehavior,
  DispatchFinishedInput,
  Effect,
  FinishInput,
} from "../component-behavior";
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
  build<T>(config: SqsConfig, context: BuildContext): ComponentBehavior<T> {
    return new SqsBehavior<T>(config, context);
  },
};

/** SQS's run-time state: messages being sent, the backlog, and deliveries. */
class SqsBehavior<T> implements ComponentBehavior<T> {
  private readonly backlog = new Queue<T>();
  private readonly sendLatency: ServiceTime;
  private readonly consumerMaxConcurrency: number;
  private sending = 0;
  private delivering = 0;

  constructor(config: SqsConfig, { random }: BuildContext) {
    this.sendLatency = new ServiceTime(config.sendLatency, random);
    this.consumerMaxConcurrency = config.consumerMaxConcurrency;
  }

  get inProgress(): number {
    return this.sending;
  }

  get queueDepth(): number {
    return this.backlog.size;
  }

  arrive({ request }: ArriveInput<T>): Effect<T>[] {
    this.sending++;
    return [{ kind: "started", request, serviceMs: this.sendLatency.next() }];
  }

  finish({ request }: FinishInput<T>): Effect<T>[] {
    this.sending--;
    this.backlog.offer(request);
    return this.deliver();
  }

  dispatchFinished({
    request,
    succeeded,
  }: DispatchFinishedInput<T>): Effect<T>[] {
    this.delivering--;
    if (!succeeded) this.backlog.offer(request);
    return this.deliver();
  }

  /** Dispatches waiting messages to every free consumer slot. */
  private deliver(): Effect<T>[] {
    const effects: Effect<T>[] = [];
    while (this.delivering < this.consumerMaxConcurrency) {
      const request = this.backlog.poll();
      if (request === undefined) break;
      this.delivering++;
      effects.push({ kind: "dispatched", request });
    }
    return effects;
  }
}
