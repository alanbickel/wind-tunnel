# Profile: Lambda

What Lambda exposes and enforces, and what the type starts with ([a service's profile](../profile-spec.md)). This profile hasn't been researched yet: it holds only the type's defaults. Where the model differs from AWS is in its [fidelity entries](lambda-fidelity.md).

## Default values and their evidence

| Component | Setting | Default | Evidence |
|---|---|---|---|
| Lambda | `concurrency` | 1,000 | Documented account default ([concurrency](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html)); see LMB-1 for scope |
| Lambda | `coldStart` | median 300 ms, p99 1 s | Assumption within the documented range (LMB-6) |
| Lambda | `idleTimeoutSec` | 600 | Observed (LMB-5) |
| Lambda | `computeTime` | median 20 ms, p99 80 ms | Assumption (workload-specific) |
