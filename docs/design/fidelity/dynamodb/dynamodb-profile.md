# Profile: DynamoDB

What DynamoDB exposes and enforces, and what the type starts with ([a service's profile](../profile-spec.md)). This profile hasn't been researched yet: it holds only the type's defaults. Where the model differs from AWS is in its [fidelity entries](dynamodb-fidelity.md).

## Default values and their evidence

| Component | Setting | Default | Evidence |
|---|---|---|---|
| DynamoDB | `readUnitsPerSec`, `writeUnitsPerSec` | 1,000, 500 | Assumption (a chosen table size) |
| DynamoDB | `burstSec` | 300 | Documented maximum (DDB-2) |
| DynamoDB | `latency` | median 5 ms, p99 20 ms | Assumption |
