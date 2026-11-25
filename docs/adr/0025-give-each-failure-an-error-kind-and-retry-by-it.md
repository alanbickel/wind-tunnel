# ADR-0025: Give each failure an error kind, and let an edge retry like the AWS SDK

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

An edge's retry policy (`RetryPolicy`: `maxAttempts`, a `backoff`, and one `baseDelayMs`) retries every failed attempt the same way: a rejection, a timeout, or an error from further down the chain. The templates write "no retries" on most edges (`AWS_EDGE_DEFAULTS`).

AWS behaves differently in two ways ([AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)):

- **The SDKs sort every failure into one of three error kinds,** by its error code and HTTP status. *Throttling* errors (`ThrottlingException`, `TooManyRequestsException`, `ProvisionedThroughputExceededException`, `SlowDown`, …) and *transient* errors (`RequestTimeout`, `InternalError`, I/O failures such as a socket timeout, any 500, 502, 503, or 504 without a recognized code) are retried. *Non-retryable* errors (`ValidationException`, `AccessDeniedException`, …) are returned at once (fidelity [ENG-3](../design/fidelity/engine-and-edges.md#eng-3-every-failure-can-be-retried)).
- **The SDKs retry on their own,** in standard mode: up to 3 attempts, full jitter, a 20 s cap, and a base delay by kind: 1,000 ms after a throttle, 50 ms after a transient error. DynamoDB clients make 4 attempts and wait from 25 ms after a transient error. A retry quota per client stops retrying when failures are widespread (fidelity [ENG-2](../design/fidelity/engine-and-edges.md#eng-2-retries-follow-the-edges-policy-not-the-aws-sdks)).

So a throttled DynamoDB or S3 request fails in Wind Tunnel where the SDK would have retried it after a delay ([DDB-4](../design/fidelity/dynamodb/dynamodb-fidelity.md#ddb-4-throttled-requests-fail-immediately), [S3-4](../design/fidelity/s3/s3-fidelity.md#s3-4-requests-refused-with-503-slow-down-fail-immediately)), and a user who wants SDK-like retries can only approximate them with one base delay ([#315](https://github.com/alanbickel/wind-tunnel/issues/315)).

What's in place:

- **Each type lists every reason it may reject with**, in `rejectionReasons`, a closed list of strings that the contract checks ([ADR-0016](0016-component-types-list-every-rejection-reason.md)). A limit that refuses declares one of them ([ADR-0014](0014-components-report-their-limits.md)), but a reason belongs to the component that produces it, not to the limit that may explain it.
- **The engine makes two failures of its own.** `timeout`, when the caller stops waiting (reserved by ADR-0016), and a failure from further down: a visit whose nested call failed ends with that call's `Failure`, whose component and reason are the cause the metrics count and the findings explain ([ADR-0017](0017-count-failed-async-deliveries-by-cause.md)).
- **An edge's defaults come from its caller's type** (`edgeDefaults`), because how long a caller waits is the caller's setting. The SDK's defaults depend on the callee: DynamoDB's differ from the rest.
- **An edge's ends never change.** An edge is connected or removed, never re-pointed ([ADR-0019](0019-edit-projects-with-commands-and-save-each-change.md)).

## Decision

### 1. Every failure has an error kind

1. **There are three kinds,** named as the SDKs name them: `ErrorKind` is `"throttling" | "transient" | "non-retryable"`. Throttling and transient are the retryable kinds.
2. **A type gives each rejection reason its kind.** `rejectionReasons` becomes a record from reason to kind, for example `{ "too-many-connections": "transient" }`, replacing the list. The set of reasons stays closed, and everything ADR-0016 checks against the list is checked against the record's keys, so a reason can't be listed without a kind. The kind belongs to the reason, not to a limit that declares it, and a behavior can't reject one reason with different kinds: a different kind is a different reason.
3. **The engine's own failures are transient.**
   - **A timeout** is transient, as the SDKs class a socket timeout.
   - **A failure from further down** is transient when it reaches the caller of the component it passed through. That component answers with an error of its own, not its callee's: API Gateway answers a failed integration with a 502, which the SDKs class as transient. The cause (its component and reason) passes up unchanged; only the kind is the passing component's.
4. **The kind travels beside the cause, not inside it.** The answer to an attempt carries its `Failure` and its kind. `Failure` stays the cause that metrics count and findings explain; a failure from further down keeps its cause while its kind changes at each component it passes through.

   For example, API Gateway calls a Lambda function, which calls DynamoDB, and DynamoDB rejects the request as `throttled`:

   | Edge | Its policy sees the cause | and the kind |
   |---|---|---|
   | Lambda → DynamoDB | DynamoDB `throttled` | `throttling` (DynamoDB's kind for `throttled`) |
   | API Gateway → Lambda | DynamoDB `throttled` | `transient` (Lambda's failure, passing DynamoDB's up) |

### 2. A policy retries only what's retryable, with a delay by kind

1. **A non-retryable failure is never retried,** whatever the edge's policy and however many attempts it has left. The call fails at once, and its caller gets the original failure, cause unchanged.
2. **A retryable failure is retried** as the policy allows, as every failure is today.
3. **A base delay per kind.** The engine resolves every policy into a maximum number of attempts, a backoff, and a base delay for each retryable kind, and `backoffMs` takes the base for the failure's kind. A custom policy has one base delay, used for both kinds, so it behaves as it does today.

### 3. "AWS SDK standard" is a named preset on the edge

1. **An edge's `retry` is either a custom policy or the preset.** The custom policy is today's `RetryPolicy`, unchanged. The preset is `{ preset: "aws-sdk-standard" }`, with an optional `maxAttempts`. These are the two settings the SDKs themselves expose: a retry mode and a maximum number of attempts.
2. **The preset stores a name, not values.** The engine resolves it when it builds a run: full jitter (`exponential-jitter`), the 20 s cap (`MAX_BACKOFF_MS`), 1,000 ms after a throttle, 50 ms after a transient error, and 3 attempts unless the edge sets `maxAttempts`. A stored name lets the editor and the findings say that an edge follows the SDK, which values filled in by a button couldn't, and it's what the retry quota needs (decision 6).
3. **The callee's type may change the preset's defaults.** `ComponentDefinition` gains an optional `sdkRetryDefaults`, with the attempts and transient base delay that its service's SDK client uses. DynamoDB sets `{ maxAttempts: 4, transientBaseDelayMs: 25 }`; a type that leaves it out takes the general values. The preset is resolved against the edge's target, so the engine needs no code about any one service (Open/Closed), and because an edge's ends never change, a preset edge never needs re-resolving after an edit. An edge's own `maxAttempts` overrides the type's.
4. **Editing the edge.** Setting the attempts on a preset edge keeps the preset, with that `maxAttempts`. Changing the backoff or a delay makes it a custom policy. The preset can't express a delay that isn't the SDK's, and a policy that says "AWS SDK standard" should behave like it. Which of the preset's resolved values the new custom policy starts from (its attempts, and which of the two base delays becomes its one) isn't decided here. That, and the rest of the edge editor's details, are [#318](https://github.com/alanbickel/wind-tunnel/issues/318)'s.
5. **The preset is a choice, not a default.** `AWS_EDGE_DEFAULTS` keeps "no retries", and the templates' edges into DynamoDB and S3 move to the preset (#318). Whether a type's `edgeDefaults` should become the preset (Lambda's, whose code calls AWS through an SDK) is a separate decision.

### 4. Saved projects and templates

A custom policy is valid exactly as before, and the preset is a new shape that no document has yet, so every saved project and template still loads, and the schema version doesn't change. A run of an unchanged project changes only if one of its types rejects with a non-retryable reason; none does yet (decision 7).

### 5. What it names

- **"Error kind"** in docs and on screen, and `ErrorKind` in code; its values are the SDKs' words.
- **"AWS SDK standard"** on screen for the preset, `"aws-sdk-standard"` in the document; **"custom"** for a policy with its own values.
- **`sdkRetryDefaults`** on `ComponentDefinition`.

### 6. Room for the retry quota

The SDK's retry quota (500 tokens per client; a retry costs 5 tokens after a throttle and 14 after a transient error; a success refunds some) isn't decided here; it's a Roadmap stub in M10. This decision leaves what it needs in place:

- **Which edges it applies to:** only preset edges, which name the SDK (decision 3.2). A custom policy is the application's own retry logic, which has no quota.
- **What a retry costs:** the failure's kind, known where the engine decides to retry (decision 2).
- **Whose quota it is:** the SDK client is per calling component and service, so the quota would be engine state keyed by the caller and its target's type, spent at the retry decision and refunded when a call settles.

### 7. Today's reasons

Every reason a type has today is retryable, so decisions 1 and 2 change no run of today's templates (#317 checks that with `npm run simulate`).

| Type | Reason | Kind | Evidence |
|---|---|---|---|
| API Gateway | `throttled` | throttling | Documented: a 429 Too Many Requests |
| Lambda | `throttled` | throttling | Documented: a 429 `TooManyRequestsException` |
| DynamoDB | `throttled` | throttling | Documented: `ProvisionedThroughputExceededException` |
| S3 | `slow-down` | throttling | Documented: 503 `SlowDown` |
| RDS | `too-many-connections` | transient | Assumption: it's the database's refusal, not an AWS API error, so no SDK classes it; a connection error is closest to the SDK's transient I/O failures |

The evidence is the [AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html) page's lists of codes. #317 records each on its type's fidelity page.

## Consequences

- **An edge can retry like the AWS SDK** without a user working out delays by kind, and DDB-4 and S3-4 can close once the templates use the preset (#318).
- **A type that models a client error** (a failed conditional write, a message too large) can make it non-retryable, and no edge will retry it.
- **Every type gives every reason a kind.** It's one more value per reason, checked by the contract. ADR-0016's list becomes a record; #317 appends an addendum there.
- **A failure from further down is transient at every caller, which isn't always true.** A Lambda function's error reaches a synchronous `Invoke` as a 200 with `X-Amz-Function-Error`, which the SDKs don't retry, so a preset edge into Lambda retries what the SDK wouldn't. A custom policy retrying it is fine: a Step Functions Task's `Retry` can match a function's errors. #317 opens a fidelity entry for the gap. Closing it would let a type say what kind a failure from below becomes when it passes through.
- **A custom policy has one base delay for both kinds.** To wait longer after a throttle, a user picks the preset. If a custom policy needs delays by kind, it can gain them later without changing the preset.
- **A type's SDK defaults reach every preset edge into it,** as a type's request-setting defaults reach every step (ADR-0024 decision 2.3). An edge that should keep its values uses a custom policy.
- **Two shapes of `retry`.** Everything that reads an edge's policy (its text, its draft, its evidence, the CLI report) handles both. The engine reads only the resolved form.
- **Follow-up:** [#317](https://github.com/alanbickel/wind-tunnel/issues/317) builds decisions 1 and 2 and the kinds in decision 7, closes ENG-3, and opens the entry for a failure from further down. [#318](https://github.com/alanbickel/wind-tunnel/issues/318) builds decision 3, the edge editor's preset, and the templates' move to it. The retry quota is the M10 stub.

## Addendum, 2026-11-24

[#317](https://github.com/alanbickel/wind-tunnel/issues/317) built decisions 1, 2.1, 2.2, and 7, and closed ENG-3, so its entry is gone from the engine page; the links to it above point at a heading that no longer exists. [ENG-3 as it stood](https://github.com/alanbickel/wind-tunnel/blob/37d771a5c233d5fa9016299104aa90ce41bdf9d1/docs/design/fidelity/engine-and-edges.md#eng-3-every-failure-can-be-retried) is kept in the history. The entry the Consequences call for, for a failure from further down, is [ENG-8](../design/fidelity/engine-and-edges.md#eng-8-a-failure-from-further-down-is-retryable-at-every-caller).

## Addendum, 2026-11-25

[#318](https://github.com/alanbickel/wind-tunnel/issues/318) built decision 3 and moved Template B's edge into DynamoDB to the preset; neither template has an edge into S3. It closed DDB-4 and S3-4, so their entries are gone, and the links to them above point at headings that no longer exist: [DDB-4](https://github.com/alanbickel/wind-tunnel/blob/f4a78b93e72de11b0886646f09d5d084aed83ac9/docs/design/fidelity/dynamodb/dynamodb-fidelity.md#ddb-4-throttled-requests-fail-immediately) and [S3-4](https://github.com/alanbickel/wind-tunnel/blob/f4a78b93e72de11b0886646f09d5d084aed83ac9/docs/design/fidelity/s3/s3-fidelity.md#s3-4-requests-refused-with-503-slow-down-fail-immediately) as they stood are kept in the history. [ENG-2](../design/fidelity/engine-and-edges.md#eng-2-retries-follow-the-edges-policy-not-the-aws-sdks) now covers only what the preset leaves out: the retry quota, and the retries an SDK would make on an edge left with none.

Decision 3.4 left open what a custom policy starts from when a preset edge's backoff or delay changes: it starts from the values the edge's field showed, the preset's attempts, its full jitter, and its base delay after a throttle.

