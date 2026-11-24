# Profile: DynamoDB

What DynamoDB exposes and enforces, and what the type starts with ([a service's profile](../profile-spec.md)). This profile hasn't been researched yet: it holds only the type's defaults. Where the model differs from AWS is in its [fidelity entries](dynamodb-fidelity.md).

## Default values and their evidence

| Component | Setting | Default | Evidence |
|---|---|---|---|
| DynamoDB | `readUnitsPerSec`, `writeUnitsPerSec` | 1,000, 500 | Assumption (a chosen table size) |
| DynamoDB | `burstSec` | 300 | Documented maximum (DDB-2) |
| DynamoDB | `latency` | median 5 ms, p99 20 ms | Assumption |
| DynamoDB | `itemSizeKb` (a read or write step's) | 1 KB | Assumption (an item within one unit of either kind); AWS's largest item is 400 KB ([constraints](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html)) |
| DynamoDB | `consistency` (a read step's) | eventually consistent | Documented: reads are eventually consistent by default, at half the units of a strongly consistent read ([read consistency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html)) |
