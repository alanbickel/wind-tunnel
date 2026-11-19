# Fidelity: DynamoDB

Where Wind Tunnel's model of DynamoDB differs from AWS. How to read an entry, and the differences that matter most, are on the [fidelity index](../fidelity.md).

#### DDB-1: Every request costs one capacity unit

- **Status:** Open
- **Kind:** Setting
- **Depends on:** Per-step request profiles (M8 item 4); it's M8 item 5.
- **Checked:** 2026-10-14
- **Wind Tunnel:** a read takes one read unit and a write takes one write unit, whatever the item.
- **AWS:** one read capacity unit is one strongly consistent read per second, or two eventually consistent reads, for items up to 4 KB. Reads are eventually consistent by default. One write capacity unit is one write per second for an item up to 1 KB. Larger items use more units.
- **Evidence:** Documented: [provisioned capacity mode](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html).
- **Skew:** Pessimistic for reads: the model charges default (eventually consistent) reads double. Optimistic for items above 1 KB (writes) or 4 KB (reads).
- **To close:** item size and read consistency on the step or component, and a cost per request.

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

## Default values and their evidence

| Component | Setting | Default | Evidence |
|---|---|---|---|
| DynamoDB | `readUnitsPerSec`, `writeUnitsPerSec` | 1,000, 500 | Assumption (a chosen table size) |
| DynamoDB | `burstSec` | 300 | Documented maximum (DDB-2) |
| DynamoDB | `latency` | median 5 ms, p99 20 ms | Assumption |
