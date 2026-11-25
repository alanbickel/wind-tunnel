# Fidelity: Engine and edges

Where Wind Tunnel's model of the engine and its edges differs from AWS. How to read an entry, and the differences that matter most, are on the [fidelity index](../fidelity.md).

#### ENG-1: Edge latency is constant

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; it's M10 item 2.
- **Checked:** 2026-10-14
- **Wind Tunnel:** each edge has one fixed `latencyMs`, paid each way. No variation, packet loss, or connection setup.
- **AWS:** network latency between services in a Region varies, with occasional slow outliers.
- **Evidence:** Assumption.
- **Skew:** Optimistic. Tail latency is understated, especially across several hops.
- **To close:** let an edge's latency be a distribution, like service times.

#### ENG-2: Retries follow the edge's policy, not the AWS SDK's

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; the preset is M8 item 6 (#318), without the retry quota, which is a Roadmap stub in M10. [ADR-0025](../../adr/0025-give-each-failure-an-error-kind-and-retry-by-it.md) decides how the preset is stored and applied, and leaves room for the quota.
- **Checked:** 2026-10-14
- **Wind Tunnel:** each edge sets `maxAttempts`, a backoff (`none`, `exponential`, `exponential-jitter`), and one `baseDelayMs`. The backoff is capped at 20 s. There's no retry budget: every caller retries as often as its policy allows, however many calls are failing.
- **AWS:** the AWS SDKs retry automatically. Standard mode (the default) makes up to 3 attempts (4 for DynamoDB clients), with full jitter, a 20 s cap, and different base delays by error type: 50 ms for transient errors (25 ms for DynamoDB) and 1,000 ms for throttling. A **retry quota** (500 tokens per client; a retry costs 14 tokens for transient errors and 5 for throttling; successes refill it) stops retries when failures are widespread. Adaptive mode also rate-limits the client's first attempts. The page notes that this updated behavior is opt-in (`AWS_NEW_RETRIES_2026=true`) until it becomes the default, and older behavior differs by SDK.
- **Evidence:** Documented: [AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).
- **Skew:** Pessimistic during outages, when retry storms in the model keep going after an SDK's quota would have stopped them. Optimistic when templates leave out retries that AWS SDKs would add on their own.
- **To close:** an "AWS SDK standard" retry preset with base delays by error type, and a retry quota per calling component.

#### ENG-4: Timeouts don't cancel work

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** A new effect in ADR-0006's interface; it's M10 item 3.
- **Checked:** 2026-10-14
- **Wind Tunnel:** when a caller times out, it stops waiting, but the work it called runs to the end and keeps holding its resources (ADR-0006).
- **AWS:** a synchronous Lambda invocation keeps running after its caller disconnects, until it finishes or hits the function's own timeout. A database usually keeps running a query after the client gives up, unless the driver sends a cancel.
- **Evidence:** Assumption for both.
- **Skew:** Mixed. Roughly right for Lambda. For databases, it depends on the driver.
- **To close:** an optional cancel-on-timeout per edge, which needs a new effect in ADR-0006's interface.

#### ENG-5: Components have no timeouts of their own

- **Status:** Open
- **Kind:** Setting
- **Depends on:** The timer effect (M8 item 19); Lambda's timeout is M8 item 21. API Gateway's integration timeout has no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** only edges time out. A Lambda function waiting on a slow database waits as long as it takes, holding its concurrency slot.
- **AWS:** a Lambda function has a timeout (default 3 s, up to 900 s); when it's reached, the invocation is stopped and its execution environment is reset (see LMB-4). API Gateway REST APIs have an integration timeout of 50 ms to 29 s (Regional and private APIs can request more).
- **Evidence:** Documented: [Lambda function timeout](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html), [API Gateway REST API quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html).
- **Skew:** Mixed. With a slow database, real functions are cut off at their timeout, which frees concurrency sooner but adds cold starts.
- **To close:** a `timeoutSec` on Lambda and API Gateway, and a way for a component to end its own work early. Until then, set the caller's edge `timeoutMs` to match: no more than 29,000 ms on API Gateway → Lambda edges.

#### ENG-6: Service times don't depend on load

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; it's M10 item 1.
- **Checked:** 2026-10-14
- **Wind Tunnel:** each service time is drawn from a fixed distribution. Load only adds the waiting that's modeled explicitly (RDS query workers, SQS backlog).
- **AWS:** real services often slow down as they get busier (CPU contention, garbage collection, lock contention), before any explicit limit is reached.
- **Evidence:** Assumption.
- **Skew:** Optimistic near saturation.
- **To close:** service times that grow with utilization, per component type.

#### ENG-7: Users don't give up or retry

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; it's M10 item 4.
- **Checked:** 2026-10-14
- **Wind Tunnel:** arrivals follow the workload's profile (an open Poisson model). The user's call to a workflow's root has no timeout and no retries.
- **AWS:** not an AWS behavior, but real clients time out, retry (browsers, mobile apps, SDKs), or leave.
- **Evidence:** Assumption (a modeling choice).
- **Skew:** Mixed. Users giving up reduces load; client retries add to it.
- **To close:** an optional client edge on workflows, with a timeout and retry policy.

#### ENG-8: A failure from further down is retryable at every caller

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet. It matters once an edge into Lambda can use the AWS SDK standard preset (#318).
- **Checked:** 2026-11-24
- **Wind Tunnel:** a component whose nested call failed answers its own caller with a transient error, whatever the failure's kind further down, so the caller's policy may retry it. The cause (the component and reason) passes up unchanged ([ADR-0025](../../adr/0025-give-each-failure-an-error-kind-and-retry-by-it.md) decision 1.3).
- **AWS:** depends on the service in between. API Gateway answers a failed integration with a 5xx error, which the SDKs class as transient. A Lambda function's error doesn't change `Invoke`'s status code: a synchronous call gets a 200 with the `X-Amz-Function-Error` header, which the SDKs don't retry.
- **Evidence:** Documented: [Lambda `Invoke`](https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html), [AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).
- **Skew:** Pessimistic on an edge into Lambda that follows the SDK: it retries a function error the SDK would return, adding load. None on a custom policy, which stands for the caller's own retry logic and may retry a function's errors, as a Step Functions Task's `Retry` can.
- **To close:** let a type say what kind a failure from below becomes when it passes through it.

## Default values and their evidence

| Component | Setting | Default | Evidence |
|---|---|---|---|
| Edges | backoff cap | 20 s | Documented ([AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)) |
| Edges from every type | `latencyMs` | 1 ms | Assumption (ENG-1) |
| Edges from every type | `retry` | 1 attempt, no retries | Assumption: the caller retries only if you say so; the AWS SDKs would retry on their own (ENG-2) |
| Edges from API Gateway | `timeoutMs` | 29,000 ms | Documented: a REST API's integration timeout is 29 s at most, unless a Regional or private API requests more ([quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html)); see ENG-5 |
| Edges from the other types | `timeoutMs` | 5,000 ms | Assumption: a client timeout of our choosing (ENG-5) |
