# Fidelity: API Gateway

Where Wind Tunnel's model of API Gateway differs from AWS. How to read an entry, and the differences that matter most, are on the [fidelity index](../../fidelity.md). Its settings and defaults are in its [profile](api-gateway-profile.md).

#### APIGW-1: The throttle limit belongs to one component, not the account

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Account groups (M8 items 13 and 14); it's M8 item 15.
- **Checked:** 2026-10-14
- **Wind Tunnel:** each API Gateway component has its own token bucket (default 10,000 requests/s, burst 5,000).
- **AWS:** the default limit applies per account, per Region, across all HTTP, REST, and WebSocket APIs. It's 2,500 requests/s with a burst of 1,250 in some newer Regions. Stage, method, and usage-plan limits can be lower.
- **Evidence:** Documented: [API Gateway quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html), [throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html).
- **Skew:** Optimistic for projects with more than one API.
- **To close:** account-level limits shared by components of the same type.

#### APIGW-2: Throttling is exact

- **Status:** Accepted: AWS's throttling is a best-effort target, so an exact bucket is the fair reading of the documented limit.
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** the token bucket is exact.
- **AWS:** "Both throttles and quotas are applied on a best-effort basis and should be thought of as targets rather than guaranteed request ceilings."
- **Evidence:** Documented: [throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html).
- **Skew:** Minor. AWS may let some extra requests through.
- **To close:** probably not worth it.

#### APIGW-3: API Gateway → Lambda edges can retry

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing for the templates' edges; client retries are ENG-7 (M10 item 4).
- **Checked:** 2026-10-14
- **Wind Tunnel:** any edge can have a retry policy, including API Gateway → Lambda.
- **AWS:** we believe API Gateway doesn't retry a failed or throttled Lambda integration; it returns the error to the client, which may retry.
- **Evidence:** Assumption.
- **Skew:** Pessimistic if a template sets retries on these edges.
- **To close:** templates should use `maxAttempts: 1` on API Gateway's outgoing edges. Model client retries with ENG-7.

#### APIGW-4: Overhead time

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** about 10 ms median, 25 ms p99, per request.
- **AWS:** not published. The difference between CloudWatch's `Latency` and `IntegrationLatency` shows the actual overhead.
- **Evidence:** Assumption.
- **Skew:** Minor.
