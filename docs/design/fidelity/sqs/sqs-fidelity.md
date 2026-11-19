# Fidelity: SQS and the Lambda consumer

Where Wind Tunnel's model of SQS and the Lambda consumer differs from AWS. How to read an entry, and the differences that matter most, are on the [fidelity index](../../fidelity.md). Its settings and defaults are in its [profile](sqs-profile.md).

#### SQS-1: Failed messages come back immediately

- **Status:** Open
- **Kind:** Setting
- **Depends on:** The timer effect (M8 item 19); it's M8 item 20.
- **Checked:** 2026-10-14
- **Wind Tunnel:** a failed delivery (including a throttled consumer) goes straight to the back of the backlog and can be delivered again at once. Messages are never dropped or moved to a dead-letter queue.
- **AWS:** a received message is hidden for the queue's visibility timeout (default 30 s) and reappears if it isn't deleted. Lambda recommends a visibility timeout of "at least six times the configuration timeout on your function". After `maxReceiveCount` receives it can move to a dead-letter queue; Lambda recommends "setting the `maxReceiveCount` on your source queue's redrive policy to at least 5". Lambda recommends keeping the event source mapping's maximum concurrency within the function's reserved concurrency, "Otherwise, Lambda might throttle your messages."
- **Evidence:** Documented: [visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html), [Lambda with SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html), [configuring an SQS event source mapping](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html) (checked 2026-10-22), [SQS scaling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html).
- **Skew:** Mixed. The model retries failed messages much sooner (faster recovery, but more pressure on a struggling consumer), and the engine guards against zero-latency redelivery loops. A failed message waits again behind the whole backlog, which in AWS it wouldn't. But under the lunch rush, a message waits in the backlog for 6.2 s at most, far less than a 30 s visibility timeout, so a write that fails once lands later in AWS than in the model ([findings.md §1.8](../../findings.md#18-variant-template-b-lunch-rush-database-connections-cut-to-10-healthy-with-failed-deliveries)). And no message is ever lost, where in AWS one that fails `maxReceiveCount` times leaves the queue.
- **To close:** a `wake-at` timer effect (ADR-0006), then visibility timeout, `maxReceiveCount`, and a dead-letter queue.

#### SQS-2: Exactly once, in order

- **Status:** Open
  - Kept open: Wind Tunnel will need to model both exactly-once and at-least-once delivery, so the gap needs closing rather than accepting, even though duplicates add little load today.
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** each message is delivered once (until it succeeds), first in, first out.
- **AWS:** standard queues deliver "at-least-once", "more than one copy of a message might be delivered, and messages may occasionally arrive out of order".
- **Evidence:** Documented: [standard queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html).
- **Skew:** Minor for load. Duplicates add a little work.

#### SQS-3: The consumer reaches full concurrency instantly

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** The timer effect (M8 item 19); it's M8 item 22.
- **Checked:** 2026-10-14
- **Wind Tunnel:** as soon as messages wait, up to `consumerMaxConcurrency` are delivered at once.
- **AWS:** in the default (non-provisioned) mode, "Lambda starts processing five batches at a time with five concurrent invocations", then adds "up to 300 more concurrent invokes per minute", up to 1,250. When traffic is low it scales back to 5 (or as few as 2). Provisioned mode scales about 3 times faster.
- **Evidence:** Documented: [SQS event source mapping scaling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html).
- **Skew:** **Optimistic** when `consumerMaxConcurrency` is above 5: after a spike, the model drains the backlog faster than AWS.
- **To close:** a ramp in the SQS definition from 5 toward the maximum, at 300 per minute.

#### SQS-4: Batch size 1, no batching window

- **Status:** Open
- **Kind:** Setting
- **Depends on:** The timer effect (M8 item 19); it's M8 item 22.
- **Checked:** 2026-10-14
- **Wind Tunnel:** one message per invocation.
- **AWS:** by default "Lambda polls up to 10 messages in your queue at once"; a batching window can wait up to 5 minutes to fill a batch, and at low traffic Lambda may wait up to 20 s.
- **Evidence:** Documented: [Lambda with SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html).
- **Skew:** Pessimistic on throughput (more invocations per message). Optimistic on per-message latency at low traffic.
- **To close:** batch size and window on the SQS component, with a batch's work scaled by its size.

#### SQS-5: Polling takes no time

- **Status:** Open
  - Kept open: delivery that takes no time removes an async step, and in a larger system that may change how the parts interact, even if the delay is small for one message.
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** a waiting message is delivered the moment a consumer slot frees up.
- **AWS:** Lambda's pollers use long polling, so there's a short, variable delay between a message arriving and an invocation starting.
- **Evidence:** Documented that pollers use long polling: [SQS scaling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html). Assumption: the delay is small.
- **Skew:** Minor.

#### SQS-6: The backlog is unlimited

- **Status:** Open
  - Kept open: the 120,000 in-flight quota is a real way for a queue to fail. The templates are too small to reach it today, but a user's own architecture might not be.
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** no limit on waiting or in-flight messages.
- **AWS:** standard queues allow about 120,000 in-flight messages (received but not deleted). The backlog itself is limited only by retention time.
- **Evidence:** Documented: [visibility timeout, in-flight messages](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html).
- **Skew:** Minor: in-flight messages never exceed the consumer's concurrency in the model.
