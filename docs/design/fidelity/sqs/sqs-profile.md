# Profile: SQS and the Lambda consumer

What SQS and its Lambda consumer expose and enforce, and what the type starts with ([a service's profile](../profile-spec.md)). This profile hasn't been researched yet: it holds only the type's defaults and its rejection reasons. Where the model differs from AWS is in its [fidelity entries](sqs-fidelity.md).

## Default values and their evidence

| Component | Setting | Default | Evidence |
|---|---|---|---|
| SQS | `consumerMaxConcurrency` | 10 (allowed 2 to 1,000) | Assumption: our choice, within the documented range ([SQS scaling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html)) |
| SQS | `sendLatency` | median 10 ms, p99 30 ms | Assumption |

## Rejection reasons

None: SQS accepts every message it's sent.
