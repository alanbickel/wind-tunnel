# Profile: API Gateway

What API Gateway exposes and enforces, and what the type starts with ([a service's profile](../profile-spec.md)). This profile hasn't been researched yet: it holds only the type's defaults. Where the model differs from AWS is in its [fidelity entries](api-gateway-fidelity.md).

## Default values and their evidence

| Component | Setting | Default | Evidence |
|---|---|---|---|
| API Gateway | `ratePerSec`, `burst` | 10,000/s, 5,000 | Documented account defaults ([quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html)); see APIGW-1 for scope |
| API Gateway | `overhead` | median 10 ms, p99 25 ms | Assumption (APIGW-4) |
