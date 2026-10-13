# AWS: Did You Know?

AWS facts and at-scale behaviors collected while building Cloud Builder. Some of these may later appear as in-app tips.

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

### Limit SQS → Lambda concurrency on the event source mapping, not only on the function

An SQS event source mapping has a **maximum concurrency** setting that limits how many concurrent invocations Lambda's queue pollers start. If you rely only on reserved concurrency, pollers can still pull messages faster than the function may run. Those invocations are throttled and the messages return to the queue; with a dead-letter queue (DLQ) configured, a message that's throttled repeatedly can end up there.

**At scale:** putting SQS in front of a database-writing Lambda and setting maximum concurrency is a standard way to keep Lambda within RDS connection limits.
**Source:** [Configuring maximum concurrency for SQS event sources](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html)

### Lambda database connections outlive the invocation

AWS recommends opening database connections outside the handler so warm execution environments can reuse them. That means each execution environment holds its connection while it's idle between invocations, not just while it's running. The number of open connections tracks how many environments exist, which can be higher than current concurrency after a spike.

**At scale:** after a spike, idle Lambda environments can keep holding RDS connections.
**Source:** [Lambda best practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)

### SQS messages expire if the backlog lasts too long

SQS keeps a message for **4 days by default**, configurable from 1 minute up to **14 days**. A message that isn't processed within that time is deleted, even if it was never handled.

**At scale:** a queue protects against short spikes, but if consumers are slower than the incoming rate for days, messages are lost. Watch the age of the oldest message (`ApproximateAgeOfOldestMessage`), not just how many are queued.
**Source:** [SQS message retention](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-basic-architecture.html)
