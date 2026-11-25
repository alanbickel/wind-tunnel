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

The limit is a **token bucket**: AWS calls the burst "the maximum bucket size", and the rate is how fast tokens are added. Each request takes a token. A quiet API saves up to 5,000 tokens, so a sudden spike can briefly pass 10,000 requests per second; sustained traffic above the rate drains the bucket, and throttling starts when it's empty. AWS also calls these limits "targets rather than guaranteed request ceilings".

**At scale:** several APIs in one account compete for the same limit. Whether a spike is throttled depends on how full the bucket was when it arrived, not only on the spike's size.
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

**At scale:** this is how a queue consumer protects a database with a fixed connection limit (Template B caps `fn-writer` at 15 so RDS never runs out of connections).
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

### Fast Lambda functions hit a request rate limit before concurrency

Lambda limits requests per second as well as concurrency: **10 × the concurrency limit**, for the account and for a function with reserved concurrency. At the default 1,000, that's 10,000 requests a second. A function that takes 200 ms reaches 1,000 concurrency at 5,000 requests a second, so concurrency runs out first; one that takes 50 ms would need 20,000 a second to fill it, so the rate runs out first, at half its concurrency. Both throttle with `429 TooManyRequestsException`.

**At scale:** for a function under 100 ms, making it faster doesn't raise how much traffic it can take. Only more concurrency does, since the rate is tied to it.
**Source:** [Understanding Lambda function scaling, concurrency and requests per second](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html#concurrency-vs-requests-per-second)

### Retries at every layer multiply

If a client makes up to 3 attempts against an API, the Lambda function behind it makes up to 3 attempts at its database call, and the database is the slow part, one user request can become **3 × 3 = 9** database queries. AWS's guidance is to retry at one layer only and to cap retries with a token bucket so a struggling service isn't buried.

**At scale:** when a database slows down, retries can multiply its load several times over, exactly when it can least afford it. Wind Tunnel's engine trace shows a 2 × 2 case: one request, four queries ([engine guide](../architecture/simulation-engine.md#the-engine-loop-a-requests-journey)).
**Source:** [Timeouts, retries, and backoff with jitter (Amazon Builders' Library)](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)

### Averages hide the requests users complain about; CloudWatch can show percentiles

CloudWatch can report percentile statistics such as `p99` for many metrics (for example API Gateway `Latency` and Lambda `Duration`), not just `Average`. When 1% of requests wait seconds for a database connection, the average barely moves, but p99 jumps. Most AWS service metrics are also published once a minute, so a 10-second spike is diluted across the whole minute. To see what Wind Tunnel's per-second snapshots show, look at `Maximum` or `p99` at the finest period available.

The CloudWatch metrics closest to Wind Tunnel's: Lambda `ConcurrentExecutions` and `Throttles`, RDS `DatabaseConnections`, and SQS `ApproximateNumberOfMessagesVisible` (backlog) and `ApproximateAgeOfOldestMessage`.

**At scale:** alarm on p99 latency and on throttles or rejections, not on average latency.
**Source:** [CloudWatch statistics and percentiles](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_concepts.html#Percentiles), [Lambda function metrics](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html)

### Lambda can't scale out instantly, and an SQS consumer starts at five

Each Lambda function can add at most **1,000 execution environments every 10 seconds**. An SQS event source mapping starts with **5 concurrent invocations** and adds up to **300 more per minute** (up to 1,250), even if its maximum concurrency is set higher.

**At scale:** a queue absorbs a spike instantly, but draining it takes longer than the consumer's maximum concurrency suggests, because the consumer has to ramp up first.
**Source:** [Lambda concurrency, scaling rate](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html), [SQS event source mapping scaling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html)

### Your code may never see a DynamoDB throttle, because the SDK retries it

The AWS SDKs automatically retry `ProvisionedThroughputExceededException`. DynamoDB clients make up to **4 attempts** by default, backing off from about a second for throttling errors. Separately, DynamoDB reads are **eventually consistent by default**, and one read capacity unit covers **two** eventually consistent reads (up to 4 KB each), versus one strongly consistent read.

**At scale:** throttling often shows up as latency, not errors. Requests slow down by seconds while the SDK retries, and errors appear only once retries run out. A Lambda function waits through its SDK's retries, so a throttled table lengthens the function's duration, and with it the concurrency the function needs (requests a second × duration): a throttled table can throttle the function that calls it.
**Source:** [DynamoDB error handling](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.Errors.html), [AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html), [DynamoDB provisioned capacity](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html), [Lambda concurrency](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html)

### A failed SQS message waits out the visibility timeout before it's retried

When a Lambda function fails on an SQS message, the message isn't retried at once: it stays hidden until the queue's **visibility timeout** ends (**30 s by default**), then becomes visible again. Lambda recommends a visibility timeout of **at least six times the function's timeout**, so a retry can wait minutes. By default, an error anywhere in a batch returns the whole batch. With a redrive policy, a message received more than `maxReceiveCount` times moves to a dead-letter queue; Lambda recommends setting it to **at least 5**.

**At scale:** a database refusing a few connections looks harmless to the API, because users were told "accepted". But every write that failed once lands at least a visibility timeout late, and one that keeps failing ends up in the dead-letter queue, where nothing writes it unless you redrive it. Watch the function's errors and the dead-letter queue, not only the queue's backlog.
**Source:** [Creating and configuring an SQS event source mapping](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html), [SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html)

### S3's request rate is per prefix, and it grows only gradually

An S3 bucket has no single request limit. Each **partitioned prefix** (the start of the object key) serves at least **3,500 writes** (`PUT`, `COPY`, `POST`, `DELETE`) and **5,500 reads** (`GET`, `HEAD`) per second, and a bucket can have any number of prefixes, so spreading keys over 10 prefixes gives 10 times the rate. Over a prefix's rate, S3 answers **`503 Slow Down`**. Under sustained load it raises the rate on its own, but **gradually**, and AWS doesn't say how fast; until it's done, some requests keep getting 503s.

**At scale:** a key layout that puts every hot object under one prefix (a date, a tenant, `uploads/`) caps the whole bucket at one prefix's rate. A sudden launch-day spike gets 503s that a slow ramp to the same rate wouldn't, because S3 had time to scale. The SDKs retry `SlowDown` as a throttling error, so it often shows up as seconds of latency first.
**Source:** [S3 performance guidelines](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html), [S3 performance design patterns](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance-design-patterns.html), [AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)

### An SSE-KMS bucket can be throttled by KMS before S3

With SSE-KMS encryption and no S3 Bucket Key, **every upload and download** makes S3 call AWS KMS on your behalf (`GenerateDataKey` or `Decrypt`). Those calls count against the account's **shared KMS request quota in the Region** (10,000 to 100,000 per second, depending on the Region), along with every other use of KMS in the account. An **S3 Bucket Key** cuts those calls by up to 99%. The default, SSE-S3, makes no KMS calls.

**At scale:** a busy bucket can fail on KMS throttling while S3 itself has room, and it can starve other services in the account that use KMS. Turn on S3 Bucket Keys for SSE-KMS buckets.
**Source:** [KMS request quotas](https://docs.aws.amazon.com/kms/latest/developerguide/requests-per-second.html), [S3 Bucket Keys](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html)

### A DynamoDB request's cost grows with its item, in steps

A read uses one read capacity unit per started **4 KB** of the item, and half that if it's eventually consistent, the default; a write uses one write capacity unit per started **1 KB**. A 4.1 KB item costs as much to read as an 8 KB one, and a 400 KB item, DynamoDB's largest, takes 400 write units to write.

**At scale:** a table's capacity is in units, not requests, so 1,000 read units serve 2,000 eventually consistent reads of a 1 KB item a second, but only 100 strongly consistent reads of a 40 KB one. Growing an item past a 4 KB (reads) or 1 KB (writes) boundary raises the cost of every request for it. In Wind Tunnel, each step sets its item's size, and a read's consistency.
**Source:** [DynamoDB provisioned capacity](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html), [DynamoDB constraints](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html)
