# Fidelity: Where Wind Tunnel Differs From AWS

Wind Tunnel simplifies AWS on purpose: a small model that shows the right failure modes is more useful early on than a large one that's hard to reason about. But every simplification shifts the results, and some can change a template's lesson. This page lists each known difference, what AWS actually does, how sure we are, and which way it skews the results, so we can decide what to improve as the project matures.

For the model itself, see the [MVP design](mvp-design.md) and the [component definitions guide](../architecture/component-definitions.md). Work to close a gap is tracked as a GitHub issue; this page holds the detail.

## How to read an entry

Each entry has an ID (e.g. `LMB-2`) so code comments, commits, and issues can refer to it.

- **Wind Tunnel:** what the model does today.
- **AWS:** what the real service does.
- **Evidence:** how we know what AWS does.
  - **Documented:** stated in AWS documentation. The link is included, and it was checked on the date at the bottom of this page.
  - **Observed:** AWS doesn't publish it; the value comes from measurements by others. Treat it as approximate.
  - **Assumption:** our belief about AWS, not yet verified. Upgrade it when someone finds a source, or correct it.
- **Skew:** which way the difference moves results.
  - **Optimistic:** the model looks healthier than AWS would.
  - **Pessimistic:** the model looks worse than AWS would.
  - **Mixed:** depends on the scenario.
  - **Minor:** unlikely to change a lesson at MVP scale.
- **To close:** what it would take to model it.

Model defaults (the numbers in each definition's `defaultConfig`) are covered in [Default values and their evidence](#default-values-and-their-evidence).

## Differences that matter most for the templates

| ID | Difference | Skew | Template |
|---|---|---|---|
| [LMB-8](#lmb-8-rds-connections-are-held-per-invocation-not-per-environment) | RDS connections are held per invocation, not per execution environment | Optimistic | A |
| [RDS-2](#rds-2-database-capacity-is-a-fixed-pool-of-query-workers) | Database capacity is a fixed pool of workers with a clean plateau | Optimistic | A |
| [RDS-4](#rds-4-opening-a-connection-is-free) | Opening a connection is free | Optimistic | A |
| [SQS-1](#sqs-1-failed-messages-come-back-immediately) | Failed messages come back immediately, not after the visibility timeout | Mixed | B |
| [SQS-3](#sqs-3-the-consumer-reaches-full-concurrency-instantly) | The SQS consumer reaches full concurrency instantly | Optimistic | B |
| [DDB-1](#ddb-1-every-request-costs-one-capacity-unit) | Every DynamoDB request costs one capacity unit | Pessimistic for reads | B |
| [DDB-4](#ddb-4-throttled-requests-fail-immediately) | Throttled DynamoDB requests fail immediately; AWS SDKs retry them | Mixed | B |
| [LMB-1](#lmb-1-concurrency-is-per-function-not-shared-by-the-account) | Lambda concurrency is per function, not shared by the account | Optimistic | B |

---

## Engine and edges

#### ENG-1: Edge latency is constant

- **Wind Tunnel:** each edge has one fixed `latencyMs`, paid each way. No variation, packet loss, or connection setup.
- **AWS:** network latency between services in a Region varies, with occasional slow outliers.
- **Evidence:** Assumption.
- **Skew:** Optimistic. Tail latency is understated, especially across several hops.
- **To close:** let an edge's latency be a distribution, like service times.

#### ENG-2: Retries follow the edge's policy, not the AWS SDK's

- **Wind Tunnel:** each edge sets `maxAttempts`, a backoff (`none`, `exponential`, `exponential-jitter`), and one `baseDelayMs`. The backoff is capped at 20 s. There's no retry budget: every caller retries as often as its policy allows, however many calls are failing.
- **AWS:** the AWS SDKs retry automatically. Standard mode (the default) makes up to 3 attempts (4 for DynamoDB clients), with full jitter, a 20 s cap, and different base delays by error type: 50 ms for transient errors (25 ms for DynamoDB) and 1,000 ms for throttling. A **retry quota** (500 tokens per client; a retry costs 14 tokens for transient errors and 5 for throttling; successes refill it) stops retries when failures are widespread. Adaptive mode also rate-limits the client's first attempts. The page notes that this updated behavior is opt-in (`AWS_NEW_RETRIES_2026=true`) until it becomes the default, and older behavior differs by SDK.
- **Evidence:** Documented: [AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).
- **Skew:** Pessimistic during outages, when retry storms in the model keep going after an SDK's quota would have stopped them. Optimistic when templates leave out retries that AWS SDKs would add on their own.
- **To close:** an "AWS SDK standard" retry preset with base delays by error type, and a retry quota per calling component.

#### ENG-3: Every failure can be retried

- **Wind Tunnel:** rejections, timeouts, and errors from further down can all be retried.
- **AWS:** SDKs retry transient and throttling errors and return other errors (e.g. `ValidationException`) at once. Every failure Wind Tunnel produces today is a throttle, a capacity rejection, or a timeout, which the SDKs treat as retryable.
- **Evidence:** Documented: [AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html). Whether a database driver retries a refused connection on its own is an assumption (it usually doesn't).
- **Skew:** Minor today. It matters once Wind Tunnel models errors that shouldn't be retried.
- **To close:** mark rejection reasons as retryable or not.

#### ENG-4: Timeouts don't cancel work

- **Wind Tunnel:** when a caller times out, it stops waiting, but the work it called runs to the end and keeps holding its resources (ADR-0006).
- **AWS:** a synchronous Lambda invocation keeps running after its caller disconnects, until it finishes or hits the function's own timeout. A database usually keeps running a query after the client gives up, unless the driver sends a cancel.
- **Evidence:** Assumption for both.
- **Skew:** Mixed. Roughly right for Lambda. For databases, it depends on the driver.
- **To close:** an optional cancel-on-timeout per edge, which needs a new effect in ADR-0006's interface.

#### ENG-5: Components have no timeouts of their own

- **Wind Tunnel:** only edges time out. A Lambda function waiting on a slow database waits as long as it takes, holding its concurrency slot.
- **AWS:** a Lambda function has a timeout (default 3 s, up to 900 s); when it's reached, the invocation is stopped and its execution environment is reset (see LMB-4). API Gateway REST APIs have an integration timeout of 50 ms to 29 s (Regional and private APIs can request more).
- **Evidence:** Documented: [Lambda function timeout](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html), [API Gateway REST API quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html).
- **Skew:** Mixed. With a slow database, real functions are cut off at their timeout, which frees concurrency sooner but adds cold starts.
- **To close:** a `timeoutSec` on Lambda and API Gateway, and a way for a component to end its own work early. Until then, set the caller's edge `timeoutMs` to match: no more than 29,000 ms on API Gateway → Lambda edges.

#### ENG-6: Service times don't depend on load

- **Wind Tunnel:** each service time is drawn from a fixed distribution. Load only adds the waiting that's modeled explicitly (RDS query workers, SQS backlog).
- **AWS:** real services often slow down as they get busier (CPU contention, garbage collection, lock contention), before any explicit limit is reached.
- **Evidence:** Assumption.
- **Skew:** Optimistic near saturation.
- **To close:** service times that grow with utilization, per component type.

#### ENG-7: Users don't give up or retry

- **Wind Tunnel:** arrivals follow the workload's profile (an open Poisson model). The user's call to a workflow's root has no timeout and no retries.
- **AWS:** not an AWS behavior, but real clients time out, retry (browsers, mobile apps, SDKs), or leave.
- **Evidence:** Assumption (a modeling choice).
- **Skew:** Mixed. Users giving up reduces load; client retries add to it.
- **To close:** an optional client edge on workflows, with a timeout and retry policy.

## API Gateway

#### APIGW-1: The throttle limit belongs to one component, not the account

- **Wind Tunnel:** each API Gateway component has its own token bucket (default 10,000 requests/s, burst 5,000).
- **AWS:** the default limit applies per account, per Region, across all HTTP, REST, and WebSocket APIs. It's 2,500 requests/s with a burst of 1,250 in some newer Regions. Stage, method, and usage-plan limits can be lower.
- **Evidence:** Documented: [API Gateway quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html), [throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html).
- **Skew:** Optimistic for projects with more than one API.
- **To close:** account-level limits shared by components of the same type.

#### APIGW-2: Throttling is exact

- **Wind Tunnel:** the token bucket is exact.
- **AWS:** "Both throttles and quotas are applied on a best-effort basis and should be thought of as targets rather than guaranteed request ceilings."
- **Evidence:** Documented: [throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html).
- **Skew:** Minor. AWS may let some extra requests through.
- **To close:** probably not worth it.

#### APIGW-3: API Gateway → Lambda edges can retry

- **Wind Tunnel:** any edge can have a retry policy, including API Gateway → Lambda.
- **AWS:** we believe API Gateway doesn't retry a failed or throttled Lambda integration; it returns the error to the client, which may retry.
- **Evidence:** Assumption.
- **Skew:** Pessimistic if a template sets retries on these edges.
- **To close:** templates should use `maxAttempts: 1` on API Gateway's outgoing edges. Model client retries with ENG-7.

#### APIGW-4: Overhead time

- **Wind Tunnel:** about 10 ms median, 25 ms p99, per request.
- **AWS:** not published. The difference between CloudWatch's `Latency` and `IntegrationLatency` shows the actual overhead.
- **Evidence:** Assumption.
- **Skew:** Minor.

## Lambda

#### LMB-1: Concurrency is per function, not shared by the account

- **Wind Tunnel:** each Lambda component has its own `concurrency` limit (default 1,000).
- **AWS:** by default an account has 1,000 concurrent executions per Region, shared by all functions. Reserved concurrency sets aside part of the pool for one function, and caps it. Up to 900 can be reserved, because 100 always stay unreserved.
- **Evidence:** Documented: [Lambda concurrency](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html).
- **Skew:** Optimistic for projects with several functions: Template B's two functions get 1,000 each in the model, but would share 1,000 in AWS.
- **To close:** an account-level pool, with an optional reserved concurrency per function.

#### LMB-2: Lambda scales out instantly

- **Wind Tunnel:** a function can go from 0 to its full concurrency at once.
- **AWS:** each function can add at most 1,000 execution environments every 10 seconds (or 10,000 requests per second every 10 seconds). The same page also says on-demand concurrency "can experience a burst increase of 500 concurrency every 10 seconds", which seems to conflict; we follow the bolded 1,000 figure.
- **Evidence:** Documented: [Lambda concurrency, scaling rate](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html).
- **Skew:** Optimistic for spikes that need more than about 1,000 new environments within 10 s. The MVP templates stay under that.
- **To close:** a token bucket on new environments.

#### LMB-3: No requests-per-second limit

- **Wind Tunnel:** only concurrency is limited.
- **AWS:** Lambda also limits requests per second to 10 × the concurrency limit (10,000/s by default), so very short functions can be throttled below their concurrency limit.
- **Evidence:** Documented: [Lambda concurrency, concurrency vs. requests per second](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html).
- **Skew:** Optimistic for functions shorter than about 100 ms at high rates.
- **To close:** a `RateLimit` in front of the concurrency limit.

#### LMB-4: Every finished invocation leaves a warm environment

- **Wind Tunnel:** any invocation, successful or failed, leaves a warm environment behind.
- **AWS:** if a function crashes or times out during an invocation, Lambda resets the environment, and the next invocation in it pays the initialization again (a "suppressed init"). We assume a function that returns an error normally (without crashing) keeps its environment.
- **Evidence:** Documented for crashes and timeouts: [execution environment lifecycle, failures during the invoke phase](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html). Assumption for handled errors.
- **Skew:** Optimistic during failure storms with timeouts: AWS pays more cold starts.
- **To close:** depends on ENG-5. Once functions can time out, a timed-out environment should go cold.

#### LMB-5: How long an environment stays warm

- **Wind Tunnel:** an environment idle for `idleTimeoutSec` (default 600 s) goes cold; otherwise it stays warm forever.
- **AWS:** Lambda "retains the execution environment for a period of time" but doesn't say how long. It also "terminates execution environments every few hours" for maintenance, even for functions invoked continuously, and may sometimes initialize environments ahead of requests.
- **Evidence:** Documented that retention is unspecified, and the periodic recycling: [execution environment lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html). Observed: the 5 to 15 minute idle lifetime comes from community measurements, not AWS.
- **Skew:** Minor for runs of minutes.

#### LMB-6: Cold start time doesn't depend on the function

- **Wind Tunnel:** cold starts are drawn from one distribution (default median 300 ms, p99 1 s), the same for every function. The environment is busy during initialization, which counts against concurrency (as in AWS).
- **AWS:** "The duration of a cold start varies from under 100 ms to over 1 second", depending on runtime, package size, and initialization code. Initialization is limited to 10 s.
- **Evidence:** Documented range: [execution environment lifecycle, cold starts](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html). Our specific numbers are an assumption inside that range.
- **Skew:** Mixed.
- **To close:** presets by runtime, once there's a source for typical values.

#### LMB-7: Memory size isn't modeled

- **Wind Tunnel:** compute time is a fixed distribution.
- **AWS:** "Any increase in memory size triggers an equivalent increase in CPU available to your function", so CPU-bound functions get faster with more memory.
- **Evidence:** Documented: [Lambda best practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html).
- **Skew:** Minor for the MVP. It matters for cost and tuning features.

#### LMB-8: RDS connections are held per invocation, not per environment

- **Wind Tunnel:** an invocation takes an RDS connection when its query arrives and gives it back when the query finishes.
- **AWS:** the recommended pattern is to open database connections outside the handler, so they're reused by later invocations in the same environment. Each warm environment then holds its connection while idle, so connections in use ≈ execution environments, not running queries.
- **Evidence:** Documented: [Lambda best practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html), [execution environment lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html) ("instead of reestablishing the connection, the original connection is used in subsequent invocations").
- **Skew:** **Optimistic.** Real Lambda → RDS runs out of connections at lower load, and stays out after a spike while environments are warm. Template A's lesson is stronger in AWS than in the model.
- **To close:** connections held by Lambda environments, released when an environment goes cold. This needs components to know about each other's environments, so it's a design change.

#### LMB-9: No provisioned concurrency or SnapStart

- **Wind Tunnel:** every environment starts cold.
- **AWS:** provisioned concurrency keeps environments initialized ahead of time; SnapStart restores them from a snapshot.
- **Evidence:** Documented: [Lambda concurrency](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html).
- **Skew:** none until a template wants to show the fix for cold starts.

## DynamoDB

#### DDB-1: Every request costs one capacity unit

- **Wind Tunnel:** a read takes one read unit and a write takes one write unit, whatever the item.
- **AWS:** one read capacity unit is one strongly consistent read per second, or two eventually consistent reads, for items up to 4 KB. Reads are eventually consistent by default. One write capacity unit is one write per second for an item up to 1 KB. Larger items use more units.
- **Evidence:** Documented: [provisioned capacity mode](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html).
- **Skew:** Pessimistic for reads: the model charges default (eventually consistent) reads double. Optimistic for items above 1 KB (writes) or 4 KB (reads).
- **To close:** item size and read consistency on the step or component, and a cost per request.

#### DDB-2: The burst bucket starts full and is reliable

- **Wind Tunnel:** unused capacity is saved for up to `burstSec` seconds (default 300), and the bucket starts full.
- **AWS:** DynamoDB "currently retains up to five minutes (300 seconds) of unused read and write capacity", "can also consume burst capacity for background maintenance and other tasks without prior notice", and "these burst capacity details might change". Whether a new table starts with a full bucket isn't documented.
- **Evidence:** Documented: [burst and adaptive capacity](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/burst-adaptive-capacity.html). Assumption: the bucket starting full.
- **Skew:** Optimistic. A full 300 s bucket hides throttling in a 60 s run, so templates set `burstSec` lower.

#### DDB-3: No partitions

- **Wind Tunnel:** one bucket for reads and one for writes per table.
- **AWS:** throttling occurs "if a single partition receives more than 3000 read operation or more than 1000 write operations" per second, even when the table has spare capacity. Adaptive capacity moves capacity to hot partitions, up to that limit.
- **Evidence:** Documented: [burst and adaptive capacity](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/burst-adaptive-capacity.html).
- **Skew:** Optimistic for skewed keys. Hot partitions are a planned template.
- **To close:** a key distribution on the workload and buckets per partition.

#### DDB-4: Throttled requests fail immediately

- **Wind Tunnel:** a throttled request is rejected, and the caller's edge decides whether to retry.
- **AWS:** "The AWS SDKs for DynamoDB automatically retry requests that receive this exception" (`ProvisionedThroughputExceededException`). DynamoDB clients default to 4 attempts, and throttling retries back off from 1,000 ms (see ENG-2).
- **Evidence:** Documented: [DynamoDB error handling](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.Errors.html), [AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).
- **Skew:** Mixed. Without SDK-like retries on the edge, the model fails requests that AWS would get through after a delay. With them, the delays and extra load show up.
- **To close:** use the ENG-2 preset on edges into DynamoDB in templates.

#### DDB-5: No on-demand mode or auto scaling

- **Wind Tunnel:** provisioned capacity only, fixed for the run.
- **AWS:** on-demand mode scales without set capacity. With provisioned capacity, auto scaling reacts when consumption stays over its target for two consecutive minutes, plus up to a few minutes of alarm delay.
- **Evidence:** Documented: [provisioned capacity mode](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html).
- **Skew:** Pessimistic compared with an auto-scaled table during long ramps. Accurate for short spikes, which auto scaling is too slow to catch.

## RDS

#### RDS-1: The default connection limit isn't tied to an instance size

- **Wind Tunnel:** `maxConnections` defaults to 90.
- **AWS:** the default `max_connections` depends on engine and memory: about memory in MB ÷ 12 for MySQL, and memory ÷ 9,531,392 bytes (capped at 5,000) for PostgreSQL, after memory reserved for the operating system. A MySQL db.t3.micro allows about 60.
- **Evidence:** Documented: [RDS maximum connections](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html#RDS_Limits.MaxConnections). Assumption: 90 as a representative small instance.
- **Skew:** depends on the instance being imitated.
- **To close:** choose an engine and instance class, and derive the limit.

#### RDS-2: Database capacity is a fixed pool of query workers

- **Wind Tunnel:** `queryWorkers` (default 16) queries run at once; extra queries wait in a first-in, first-out line, holding their connection. Throughput stays flat at the workers' capacity however long the line gets.
- **AWS:** databases have no such fixed pool. Capacity is shared CPU, I/O, memory, and locks, and throughput often *falls* past saturation, as contention and context switching grow.
- **Evidence:** Assumption (an abstraction).
- **Skew:** Optimistic under overload: the model plateaus where a real database may degrade.
- **To close:** service time that grows with the number of running queries (ENG-6).

#### RDS-3: Connections are held only while a query runs or waits

See [LMB-8](#lmb-8-rds-connections-are-held-per-invocation-not-per-environment).

#### RDS-4: Opening a connection is free

- **Wind Tunnel:** getting a connection takes no time and no database capacity.
- **AWS:** opening a connection takes network round trips, TLS, and authentication, and uses database CPU and memory ("Database connections consume memory"). A burst of new Lambda environments opening connections adds load just as the database is busiest.
- **Evidence:** Documented that connections consume memory, and RDS Proxy is recommended when apps "frequently open and close connections": [RDS maximum connections](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html#RDS_Limits.MaxConnections). Assumption: the time cost.
- **Skew:** Optimistic during scale-out.
- **To close:** a connect cost on the first query from each new environment, once LMB-8 is modeled.

#### RDS-5: Refused connections fail instantly

- **Wind Tunnel:** with every connection in use, a request is rejected at once with `too-many-connections`.
- **AWS:** the engine refuses the connection (MySQL's "Too many connections" error, PostgreSQL's "too many clients"). The time to fail and whether drivers or pools retry depends on the client.
- **Evidence:** Assumption (engine behavior, not AWS-specific).
- **Skew:** Minor.

#### RDS-6: No RDS Proxy, read replicas, or Multi-AZ

- **Wind Tunnel:** a single database instance.
- **AWS:** RDS Proxy pools connections and is recommended when applications open many connections, as Lambda does.
- **Evidence:** Documented: [RDS maximum connections](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html#RDS_Limits.MaxConnections).
- **Skew:** none until a template wants to show the fix for Template A.

## SQS and the Lambda consumer

#### SQS-1: Failed messages come back immediately

- **Wind Tunnel:** a failed delivery (including a throttled consumer) goes straight to the back of the backlog and can be delivered again at once. Messages are never dropped or moved to a dead-letter queue.
- **AWS:** a received message is hidden for the queue's visibility timeout (default 30 s) and reappears if it isn't deleted. Lambda recommends a visibility timeout of "at least six times the configuration timeout on your function". After `maxReceiveCount` receives it can move to a dead-letter queue; Lambda recommends "setting the `maxReceiveCount` on your source queue's redrive policy to at least 5". Lambda recommends keeping the event source mapping's maximum concurrency within the function's reserved concurrency, "Otherwise, Lambda might throttle your messages."
- **Evidence:** Documented: [visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html), [Lambda with SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html), [configuring an SQS event source mapping](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html) (checked 2026-10-22), [SQS scaling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html).
- **Skew:** Mixed. The model retries failed messages much sooner (faster recovery, but more pressure on a struggling consumer), and the engine guards against zero-latency redelivery loops. A failed message waits again behind the whole backlog, which in AWS it wouldn't. But under the lunch rush, a message waits in the backlog for 6.2 s at most, far less than a 30 s visibility timeout, so a write that fails once lands later in AWS than in the model ([findings.md §1.8](findings.md#18-variant-template-b-lunch-rush-database-connections-cut-to-10-healthy-with-failed-deliveries)). And no message is ever lost, where in AWS one that fails `maxReceiveCount` times leaves the queue.
- **To close:** a `wake-at` timer effect (ADR-0006), then visibility timeout, `maxReceiveCount`, and a dead-letter queue.

#### SQS-2: Exactly once, in order

- **Wind Tunnel:** each message is delivered once (until it succeeds), first in, first out.
- **AWS:** standard queues deliver "at-least-once", "more than one copy of a message might be delivered, and messages may occasionally arrive out of order".
- **Evidence:** Documented: [standard queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html).
- **Skew:** Minor for load. Duplicates add a little work.

#### SQS-3: The consumer reaches full concurrency instantly

- **Wind Tunnel:** as soon as messages wait, up to `consumerMaxConcurrency` are delivered at once.
- **AWS:** in the default (non-provisioned) mode, "Lambda starts processing five batches at a time with five concurrent invocations", then adds "up to 300 more concurrent invokes per minute", up to 1,250. When traffic is low it scales back to 5 (or as few as 2). Provisioned mode scales about 3 times faster.
- **Evidence:** Documented: [SQS event source mapping scaling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html).
- **Skew:** **Optimistic** when `consumerMaxConcurrency` is above 5: after a spike, the model drains the backlog faster than AWS.
- **To close:** a ramp in the SQS definition from 5 toward the maximum, at 300 per minute.

#### SQS-4: Batch size 1, no batching window

- **Wind Tunnel:** one message per invocation.
- **AWS:** by default "Lambda polls up to 10 messages in your queue at once"; a batching window can wait up to 5 minutes to fill a batch, and at low traffic Lambda may wait up to 20 s.
- **Evidence:** Documented: [Lambda with SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html).
- **Skew:** Pessimistic on throughput (more invocations per message). Optimistic on per-message latency at low traffic.
- **To close:** batch size and window on the SQS component, with a batch's work scaled by its size.

#### SQS-5: Polling takes no time

- **Wind Tunnel:** a waiting message is delivered the moment a consumer slot frees up.
- **AWS:** Lambda's pollers use long polling, so there's a short, variable delay between a message arriving and an invocation starting.
- **Evidence:** Documented that pollers use long polling: [SQS scaling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html). Assumption: the delay is small.
- **Skew:** Minor.

#### SQS-6: The backlog is unlimited

- **Wind Tunnel:** no limit on waiting or in-flight messages.
- **AWS:** standard queues allow about 120,000 in-flight messages (received but not deleted). The backlog itself is limited only by retention time.
- **Evidence:** Documented: [visibility timeout, in-flight messages](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html).
- **Skew:** Minor: in-flight messages never exceed the consumer's concurrency in the model.

## Default values and their evidence

The Details tab quotes this table: each setting's help ends with its default and how sure it is ("Default 16: an assumption (RDS-2)."). A new edge's settings come from its caller's type (`edgeDefaults`), so the edge rows are by caller. The field descriptors in [`src/application/details/fields/`](../../src/application/details/fields/) carry the level and the entry, and `field-evidence.test.ts` checks them against this table, so keep each Evidence cell starting with its level and naming its entry, if it has one, by ID.

| Component | Setting | Default | Evidence |
|---|---|---|---|
| API Gateway | `ratePerSec`, `burst` | 10,000/s, 5,000 | Documented account defaults ([quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html)); see APIGW-1 for scope |
| API Gateway | `overhead` | median 10 ms, p99 25 ms | Assumption (APIGW-4) |
| Lambda | `concurrency` | 1,000 | Documented account default ([concurrency](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html)); see LMB-1 for scope |
| Lambda | `coldStart` | median 300 ms, p99 1 s | Assumption within the documented range (LMB-6) |
| Lambda | `idleTimeoutSec` | 600 | Observed (LMB-5) |
| Lambda | `computeTime` | median 20 ms, p99 80 ms | Assumption (workload-specific) |
| DynamoDB | `readUnitsPerSec`, `writeUnitsPerSec` | 1,000, 500 | Assumption (a chosen table size) |
| DynamoDB | `burstSec` | 300 | Documented maximum (DDB-2) |
| DynamoDB | `latency` | median 5 ms, p99 20 ms | Assumption |
| RDS | `maxConnections` | 90 | Assumption; documented formula in RDS-1 |
| RDS | `queryWorkers` | 16 | Assumption (RDS-2) |
| RDS | `queryTime` | median 15 ms, p99 60 ms | Assumption (workload-specific) |
| SQS | `consumerMaxConcurrency` | 10 (allowed 2 to 1,000) | Assumption: our choice, within the documented range ([SQS scaling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html)) |
| SQS | `sendLatency` | median 10 ms, p99 30 ms | Assumption |
| Edges | backoff cap | 20 s | Documented ([AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)) |
| Edges from every type | `latencyMs` | 1 ms | Assumption (ENG-1) |
| Edges from every type | `retry` | 1 attempt, no retries | Assumption: the caller retries only if you say so; the AWS SDKs would retry on their own (ENG-2) |
| Edges from API Gateway | `timeoutMs` | 29,000 ms | Documented: a REST API's integration timeout is 29 s at most, unless a Regional or private API requests more ([quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html)); see ENG-5 |
| Edges from the other types | `timeoutMs` | 5,000 ms | Assumption: a client timeout of our choosing (ENG-5) |

## Keeping this page current

- When a model simplifies AWS behavior, add an entry here in the same change, and mention its ID in the code comment that makes the simplification.
- When a gap is closed, delete the entry (git history keeps it) and update the code comment.
- An Assumption becomes Documented only with a link to AWS documentation that states it. Re-check links before quoting them in the app; AWS quotas and behavior change.
- Facts worth teaching can also go in [AWS: Did you know?](../learning/aws-did-you-know.md).

Sources checked: 2026-10-14.
