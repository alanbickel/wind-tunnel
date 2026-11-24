# Fidelity: DynamoDB

Where Wind Tunnel's model of DynamoDB differs from AWS. How to read an entry, and the differences that matter most, are on the [fidelity index](../../fidelity.md). Its settings and defaults are in its [profile](dynamodb-profile.md).

#### DDB-2: The burst bucket starts full and is reliable

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** unused capacity is saved for up to `burstSec` seconds (default 300), and the bucket starts full.
- **AWS:** DynamoDB "currently retains up to five minutes (300 seconds) of unused read and write capacity", "can also consume burst capacity for background maintenance and other tasks without prior notice", and "these burst capacity details might change". Whether a new table starts with a full bucket isn't documented.
- **Evidence:** Documented: [burst and adaptive capacity](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/burst-adaptive-capacity.html). Assumption: the bucket starting full.
- **Skew:** Optimistic. A full 300 s bucket hides throttling in a 60 s run, so templates set `burstSec` lower.

#### DDB-3: No partitions

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** A key distribution on the workload. Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** one bucket for reads and one for writes per table.
- **AWS:** throttling occurs "if a single partition receives more than 3000 read operation or more than 1000 write operations" per second, even when the table has spare capacity. Adaptive capacity moves capacity to hot partitions, up to that limit.
- **Evidence:** Documented: [burst and adaptive capacity](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/burst-adaptive-capacity.html).
- **Skew:** Optimistic for skewed keys. Hot partitions are a planned template.
- **To close:** a key distribution on the workload and buckets per partition.

#### DDB-4: Throttled requests fail immediately

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** ENG-2's AWS SDK retry preset (M8 item 6).
- **Checked:** 2026-10-14
- **Wind Tunnel:** a throttled request is rejected, and the caller's edge decides whether to retry.
- **AWS:** "The AWS SDKs for DynamoDB automatically retry requests that receive this exception" (`ProvisionedThroughputExceededException`). DynamoDB clients default to 4 attempts, and throttling retries back off from 1,000 ms (see ENG-2).
- **Evidence:** Documented: [DynamoDB error handling](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.Errors.html), [AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).
- **Skew:** Mixed. Without SDK-like retries on the edge, the model fails requests that AWS would get through after a delay. With them, the delays and extra load show up.
- **To close:** use the ENG-2 preset on edges into DynamoDB in templates.

#### DDB-5: No on-demand mode or auto scaling

- **Status:** Open
- **Kind:** Setting
- **Depends on:** Auto scaling, which "Later in M8" needs for other types. Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** provisioned capacity only, fixed for the run.
- **AWS:** on-demand mode scales without set capacity. With provisioned capacity, auto scaling reacts when consumption stays over its target for two consecutive minutes, plus up to a few minutes of alarm delay.
- **Evidence:** Documented: [provisioned capacity mode](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html).
- **Skew:** Pessimistic compared with an auto-scaled table during long ramps. Accurate for short spikes, which auto scaling is too slow to catch.

#### DDB-6: A capacity bucket always holds the largest request

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-11-24
- **Wind Tunnel:** each bucket holds `burstSec` seconds of its capacity, but never less than the largest request can take: 100 read units (a strongly consistent read of a 400 KB item) and 400 write units (a write of one). A table with `burstSec` 0 can still spend that much at once.
- **AWS:** a request uses one read unit per started 4 KB, or one write unit per started 1 KB, of items up to 400 KB, so one request can need more than a small table's capacity for a second. What DynamoDB does when a request needs more units than the table has saved up isn't documented.
- **Evidence:** Documented: [capacity unit sizes and the 400 KB item size](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html). Assumption: that such a request is served rather than refused for ever.
- **Skew:** Optimistic only for a table whose `burstSec` saves less than the largest request: 100 read units or 400 write units. AWS keeps up to 300 seconds, so it matters only for tables of under 2 units a second, or a `burstSec` set lower to show raw capacity.
- **To close:** evidence of what AWS does with a request larger than its table's saved-up capacity.
