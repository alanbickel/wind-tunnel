# Profile: API Gateway

What API Gateway exposes and enforces, and what the type starts with ([a service's profile](../profile-spec.md)). This profile hasn't been researched yet: it holds only the type's defaults and its rejection reasons. Where the model differs from AWS is in its [fidelity entries](api-gateway-fidelity.md).

## Default values and their evidence

| Component | Setting | Default | Evidence |
|---|---|---|---|
| API Gateway | `ratePerSec`, `burst` | 10,000/s, 5,000 | Documented account defaults ([quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html)); see APIGW-1 for scope |
| API Gateway | `overhead` | median 10 ms, p99 25 ms | Assumption (APIGW-4) |

## Rejection reasons

Each reason the type rejects with, and its [error kind](../../../glossary.md#error-kind), which decides whether an edge may retry it (ADR-0025).

| Reason | Error kind | Evidence |
|---|---|---|
| `throttled` | throttling | Documented: a 429 Too Many Requests, which the SDKs class as throttling ([AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)) |
