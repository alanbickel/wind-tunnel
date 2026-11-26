# Profile: S3

What S3 exposes and enforces, researched before the type's code ([a service's profile](../profile-spec.md)). Where the model differs from AWS is in its [fidelity entries](s3-fidelity.md).

- **Checked:** 2026-11-19
- **The model, in one line:** a component is one partitioned prefix of a general purpose bucket, in S3 Standard. It has a fixed rate for reads and one for writes, refuses a request over its rate as `503 Slow Down`, and serves the rest after a latency drawn for the action.
- **Model choices:**
  - **A fixed rate.** S3 raises a busy prefix's rate on its own, but AWS doesn't say how fast, only that it "happens gradually and is not instantaneous". The model holds the documented baseline, which AWS gives as "at least" the rate, so a run shows the load that would start S3 scaling and not a guess at how quickly it would catch up (S3-2). The type's rate limits don't change during a run.
  - **A burst of one second's requests.** AWS gives the rates per second and doesn't say how requests are counted within the second, so each rate is a token bucket that holds one second of requests, with no burst setting (S3-3).
  - **Assumed latencies.** AWS gives ranges for small objects, not distributions, so the default latencies are assumed medians and p99s inside those ranges, the same for every object size (S3-5).

## Actions

| Wind Tunnel action | S3 requests | Rate it counts against | Evidence |
|---|---|---|---|
| `read` | `GET`, `HEAD` | 5,500 per second | Documented ([performance guidelines](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html)) |
| `read` | `LIST` | the same 5,500 | Assumption: AWS names only `GET` and `HEAD` |
| `write` | `PUT`, `COPY`, `POST`, `DELETE` | 3,500 per second | Documented ([performance guidelines](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html)) |

## Settings

Settings AWS exposes that could change how the bucket behaves under load. Event notifications, replication, lifecycle rules, Object Lock, and request payment don't change how a request is served, so they're left out.

| Setting | AWS default | Range | Modeled |
|---|---|---|---|
| Key layout (which prefixes keys use) | Your choice | Any number of prefixes per bucket | No: one prefix per component (S3-1) |
| Object size | Your choice | Up to 5 TB; 5 GB in a single `PUT` | No (S3-5) |
| Storage class | S3 Standard | Standard, Intelligent-Tiering, Standard-IA, One Zone-IA, the Glacier classes; Express One Zone in a directory bucket | Standard only (S3-6) |
| Default encryption | SSE-S3, applied to every bucket since 2023-01-05 | SSE-S3, SSE-KMS (with or without an S3 Bucket Key), DSSE-KMS | SSE-S3 only (S3-7) |
| Versioning | Off | Off, Enabled, Suspended | No (S3-8) |
| Transfer Acceleration | Off | Enabled or Suspended | No (S3-9) |

Evidence: Documented: [default encryption FAQ](https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-encryption-faq.html), [performance design patterns](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance-design-patterns.html), [organizing objects using prefixes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-prefixes.html), [Transfer Acceleration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transfer-acceleration.html).

## Default values and their evidence

What the type starts with, and how sure each default is.

| Component | Setting | Default | Evidence |
|---|---|---|---|
| S3 | `readsPerSec`, `writesPerSec` | 5,500/s, 3,500/s | Documented baseline per partitioned prefix ([performance guidelines](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html)); see S3-2 |
| S3 | `readLatency` | median 20 ms, p99 150 ms | Assumption, within AWS's "tens of milliseconds" median and 100–200 ms for small objects (S3-5) |
| S3 | `writeLatency` | median 30 ms, p99 200 ms | Assumption, within the same ranges (S3-5) |

## Quotas

| Quota | Default | Raisable | Scope | Modeled |
|---|---|---|---|---|
| `PUT`/`COPY`/`POST`/`DELETE` requests | at least 3,500 per second | No request to make: S3 scales it on its own, gradually | Per partitioned prefix | Yes, as `writesPerSec`, held fixed (S3-1, S3-2) |
| `GET`/`HEAD` requests | at least 5,500 per second | As above | Per partitioned prefix | Yes, as `readsPerSec`, held fixed (S3-1, S3-2) |
| Prefixes in a bucket | No limit | Not applicable | Per bucket | One per component (S3-1) |
| KMS cryptographic requests, with SSE-KMS | 10,000, 20,000, or 100,000 per second, by Region | Yes | Per account and Region, shared with every other use of KMS | No (S3-7) |

Evidence: Documented: [performance guidelines](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html), [KMS request quotas](https://docs.aws.amazon.com/kms/latest/developerguide/requests-per-second.html).

## Behavior under load

- **Over the rate:** refused with HTTP 503 and the error code `SlowDown`. The AWS SDKs class `SlowDown` as a throttling error and retry it, by default after a jittered wait of up to 1,000 ms and then up to 2,000 ms, three attempts in all. An edge with the AWS SDK standard preset retries it so (ENG-2). Documented: [performance design patterns](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance-design-patterns.html), [AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).
- **Scaling:** for a "sustained new request rate", S3 scales a prefix up on its own, gradually. While it does, some requests get 503s; once it's done, "all requests are generally served without retries". AWS doesn't say how long scaling takes or how far it goes (S3-2). Documented: [performance design patterns](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance-design-patterns.html).
- **Bursts:** AWS gives the rates per second and says nothing about a burst over them (S3-3). Assumption.
- **Latency:** for small requests (under 512 KB), "median latencies are often in the tens of milliseconds"; latency-sensitive applications "can achieve consistent small object latencies … of roughly 100–200 milliseconds". AWS advises retrying a small `GET` or `PUT` that hasn't answered after 2 s. Larger objects take longer to transfer (S3-5). Documented: [performance guidelines](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html), [performance design patterns](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance-design-patterns.html).
- **Versioned objects:** an object with millions of versions makes S3 throttle `PUT` and `DELETE` requests to the whole bucket, with `503` responses (S3-8). Documented: [troubleshooting versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/troubleshooting-versioning.html).

## Rejection reasons

Each reason the type rejects with, and its [error kind](../../../glossary.md#error-kind), which decides whether an edge may retry it (ADR-0025).

| Reason | Error kind | Evidence |
|---|---|---|
| `slow-down` | throttling | Documented: a 503 `SlowDown`, which the SDKs class as throttling ([AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)) |
