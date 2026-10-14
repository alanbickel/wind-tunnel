# AWS: Did You Know?

AWS facts and at-scale behaviors collected while building Wind Tunnel. Some of these may later appear as in-app tips.

Each entry has the fact, why it matters at scale, and a source. AWS quotas change over time, so re-check the source before showing an entry in the app.

---

### Lambda concurrency is shared across the whole account

By default, all Lambda functions in an account share a pool of **1,000 concurrent executions per region**. One function that is busy or stuck can use up the pool and cause other functions to be throttled. Reserved concurrency limits how much one function can take.

**At scale:** a traffic spike on one endpoint can throttle unrelated functions.
**Source:** [Lambda concurrency](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html)

### RDS connection limits depend on instance size

An RDS instance's `max_connections` defaults to a value based on its memory, often in the hundreds for small instances. Lambda can scale to 1,000 concurrent executions, each opening its own connection.

**At scale:** Lambda → RDS is a classic way to run out of connections. RDS Proxy pools and shares connections to prevent it.
**Source:** [RDS max connections](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html#RDS_Limits.MaxConnections)

### DynamoDB throughput is limited per partition, not just per table

Each DynamoDB partition supports up to **3,000 read capacity units and 1,000 write capacity units** per second. A table with plenty of total capacity can still throttle if traffic concentrates on one partition key (a "hot partition").

**At scale:** partition key design matters as much as total capacity.
**Source:** [Partition key design](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html)

### API Gateway has account-level throttling

API Gateway applies a default account-level limit per region (**10,000 requests per second, with a burst of 5,000**) across all APIs in the account. Requests above the limit get `429 Too Many Requests`.

**At scale:** several APIs in one account compete for the same limit.
**Source:** [API Gateway throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html)

### Retries without jitter can keep an outage going

When a dependency slows down, clients that retry immediately or on fixed intervals add load to it just as it's struggling. AWS recommends exponential backoff **with jitter** (randomized delays) so retries spread out instead of arriving in synchronized waves.

**At scale:** retry storms can keep a system down after the original problem is fixed.
**Source:** [Timeouts, retries, and backoff with jitter (Amazon Builders' Library)](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)

### SQS standard queues deliver at least once

SQS standard queues support very high throughput, but a message can occasionally be delivered more than once, and order isn't guaranteed. FIFO queues guarantee order and exactly-once processing, with lower throughput.

**At scale:** consumers of standard queues must be idempotent.
**Source:** [SQS standard queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html)

### Lambda database connections outlive the invocation

AWS recommends opening database connections outside the handler so warm execution environments can reuse them. That means each execution environment holds its connection while it's idle between invocations, not just while it's running. The number of open connections tracks how many environments exist, which can be higher than current concurrency after a spike.

**At scale:** after a spike, idle Lambda environments can keep holding RDS connections.
**Source:** [Lambda best practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)

### SQS messages expire if the backlog lasts too long

SQS keeps a message for **4 days by default**, configurable from 1 minute up to **14 days**. A message that isn't processed within that time is deleted, even if it was never handled.

**At scale:** a queue protects against short spikes, but if consumers are slower than the incoming rate for days, messages are lost. Watch the age of the oldest message (`ApproximateAgeOfOldestMessage`), not just how many are queued.
**Source:** [SQS message retention](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-basic-architecture.html)

### Lambda pulls from SQS; SQS never pushes

When SQS "triggers" a Lambda function, the **Lambda service** is polling the queue through an **event source mapping**, fetching batches and invoking the function. On success Lambda deletes the messages; on failure they reappear after the visibility timeout and are retried, or moved to a dead-letter queue.

**At scale:** because the consumer side controls the pace, a queue can absorb a spike while consumers drain it at a safe rate.
**Source:** [Using Lambda with Amazon SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html)

### Limit SQS consumers with maximum concurrency, not reserved concurrency

An SQS event source mapping has a **maximum concurrency** setting (2 to 1,000) that stops the pollers from pulling more messages than that many concurrent invocations can handle. Capping the function with **reserved concurrency** instead makes Lambda throttle invocations while the pollers keep pulling: the messages return to the queue, and repeated throttling can send healthy messages to the dead-letter queue.

**At scale:** this is how a queue consumer protects a database with a fixed connection limit (Template B caps `fn-writer` at 40 so RDS never runs out of connections).
**Source:** [Configuring maximum concurrency for SQS event sources](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html)

### A timeout upstream doesn't stop the work downstream

When API Gateway hits its integration timeout (**29 seconds** by default for REST APIs), it returns `504` to the client, but the Lambda function keeps running until it finishes or reaches its own timeout. Likewise, a database usually keeps executing a query after the Lambda that sent it gives up.

**At scale:** timed-out requests still use capacity. When clients retry, each retry adds new work on top of the abandoned work that is still running, so retries make overload worse. Wind Tunnel models this: a timeout stops the caller from waiting, but never cancels the callee ([ADR-0006](../adr/0006-components-return-effects-to-the-engine.md)).
**Source:** [API Gateway quotas (integration timeout)](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html), [Lambda function timeout](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html)

### DynamoDB saves up unused capacity for bursts

A provisioned DynamoDB table keeps up to **300 seconds** of unused read and write capacity and spends it when traffic exceeds the provisioned rate. AWS uses the same burst capacity for background work and doesn't guarantee it's available.

**At scale:** a short spike may pass without throttling, then the same spike an hour later is throttled because the burst was already spent. Size provisioned capacity for the sustained rate, or use on-demand mode for unpredictable traffic.
**Source:** [DynamoDB burst capacity](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/burst-adaptive-capacity.html)

### Cold starts count toward Lambda concurrency

A cold start (downloading code and running the initialization code outside the handler) happens inside the execution environment, so it holds a concurrency slot the whole time. During a spike, many environments start at once, every one of them pays the cold start, and concurrency climbs faster than the request rate alone suggests. AWS doesn't publish how long an idle environment stays warm.

**At scale:** concurrency ≈ requests per second × duration, and during a spike the duration includes the cold start. Provisioned concurrency keeps environments initialized ahead of time.
**Source:** [Lambda execution environment lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html), [Understanding Lambda function scaling](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html)

### Retries at every layer multiply

If a client makes up to 3 attempts against an API, the Lambda function behind it makes up to 3 attempts at its database call, and the database is the slow part, one user request can become **3 × 3 = 9** database queries. AWS's guidance is to retry at one layer only and to cap retries with a token bucket so a struggling service isn't buried.

**At scale:** when a database slows down, retries can multiply its load several times over, exactly when it can least afford it. Wind Tunnel's engine trace shows a 2 × 2 case: one request, four queries ([engine guide](../architecture/simulation-engine.md#the-engine-loop-a-requests-journey)).
**Source:** [Timeouts, retries, and backoff with jitter (Amazon Builders' Library)](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)

### Averages hide the requests users complain about; CloudWatch can show percentiles

CloudWatch can report percentile statistics such as `p99` for many metrics (for example API Gateway `Latency` and Lambda `Duration`), not just `Average`. When 1% of requests wait seconds for a database connection, the average barely moves, but p99 jumps. Most AWS service metrics are also published once a minute, so a 10-second spike is diluted across the whole minute. To see what Wind Tunnel's per-second snapshots show, look at `Maximum` or `p99` at the finest period available.

The CloudWatch metrics closest to Wind Tunnel's: Lambda `ConcurrentExecutions` and `Throttles`, RDS `DatabaseConnections`, and SQS `ApproximateNumberOfMessagesVisible` (backlog) and `ApproximateAgeOfOldestMessage`.

**At scale:** alarm on p99 latency and on throttles or rejections, not on average latency.
**Source:** [CloudWatch statistics and percentiles](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_concepts.html#Percentiles), [Lambda function metrics](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html)
