# Profile: DynamoDB

What DynamoDB exposes and enforces, and what the type starts with ([a service's profile](../profile-spec.md)). This profile hasn't been researched yet: it holds only the type's defaults and its rejection reasons. Where the model differs from AWS is in its [fidelity entries](dynamodb-fidelity.md).

## Default values and their evidence

| Component | Setting | Default | Evidence |
|---|---|---|---|
| DynamoDB | `readUnitsPerSec`, `writeUnitsPerSec` | 1,000, 500 | Assumption (a chosen table size) |
| DynamoDB | `burstSec` | 300 | Documented maximum (DDB-2) |
| DynamoDB | `latency` | median 5 ms, p99 20 ms | Assumption |
| DynamoDB | `itemSizeKb` (a read or write step's) | 1 KB | Assumption (an item within one unit of either kind); AWS's largest item is 400 KB ([constraints](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html)) |
| DynamoDB | `sdkRetryDefaults` (for preset edges into it) | 4 attempts, 25 ms after a transient error | Documented: DynamoDB clients' defaults in standard mode ([AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)); see ENG-2 |
| DynamoDB | `consistency` (a read step's) | eventually consistent | Documented: reads are eventually consistent by default, at half the units of a strongly consistent read ([read consistency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html)) |

## Rejection reasons

Each reason the type rejects with, and its [error kind](../../../glossary.md#error-kind), which decides whether an edge may retry it (ADR-0025).

| Reason | Error kind | Evidence |
|---|---|---|
| `throttled` | throttling | Documented: `ProvisionedThroughputExceededException`, which the SDKs class as throttling ([AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)) |
