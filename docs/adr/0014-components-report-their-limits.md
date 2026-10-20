# ADR-0014: Components report their limits; a rate limit's use is how far its bucket was drawn down

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

A run's snapshots say how much work each component holds, but not the limit that work is measured against. In Template A, `orders-db` holds 90 connections at the peak, and nothing in the snapshot says that 90 is `maxConnections`. The reader has to know the configuration to see that the limit was hit. The findings coming later in M5 ([#47](https://github.com/alanbickel/wind-tunnel/issues/47)) need the same numbers to say "orders-db ran out of connections from 15 s to 47 s", or, for a healthy run, "busiest: fn-api at 10% of its concurrency" ([#46](https://github.com/alanbickel/wind-tunnel/issues/46)).

Components enforce two kinds of limit:

- **Concurrency limits** hold slots: Lambda `concurrency`, RDS `maxConnections` and its query workers, SQS `consumerMaxConcurrency`. "88 of 90 held" needs no explaining.
- **Rate limits** are token buckets: API Gateway's throttle, and DynamoDB's read and write capacity. Tokens refill at a steady rate, up to a burst size. Each request takes one, and a request that finds less than one token is throttled. A bucket has two numbers, so "how much of it was used?" has two reasonable answers:
  - **A. Flow:** tokens taken per second, against the refill rate.
  - **B. Level:** how far the bucket was drawn down, against its size.

The engine knows nothing about component types (Open/Closed), and [ADR-0007](0007-metrics-observe-the-engine.md) gave components `gauges` for type-specific values. A gauge is sampled at each tick, though, so it misses a spike between ticks, and it doesn't carry the limit it's measured against.

## Decision

**Each component declares its limits, and the metrics report each limit's use against it.**

- A `ComponentBehavior` may expose `limits`: one array of live views (`LimitGauge`), built once. A concurrency view gives `limit` and `inUse`. A rate view gives `ratePerSec`, `burst`, the running count of tokens `taken`, and `tokensLeft(nowMs)`, which only reads. `concurrencyGauge` and `rateGauge` (`domain/components/limit-gauges.ts`) build views over a `ConcurrencyLimit` or a `RateLimit`, which now expose their limit values.
- The engine reads every limit after every call into the component, as it already does for `peakInProgress`, and keeps each limit's highest use since the last tick. Peaks are exact, not sampled.
- Each snapshot's `ComponentMetrics` gets `limits: LimitUse[]`, each with `name`, `kind`, `limit`, `current` (at the window's end), and `peak` (the most at once during the window). In the run's totals, `peak` is the highest of any window and `current` is the last window's.
- **`peak / limit` is the share used at the busiest moment, from 0 to 1, for every limit.** When a limit ran out depends on its kind, so one rule, `limitExhausted` (`domain/metrics/limit-exhausted.ts`), decides it for the CLI, the run panel, and the findings: a concurrency limit is exhausted at `peak >= limit`, every slot held; a bucket at `peak > limit − 1`, less than one token left, which is where `tryTake` starts refusing. Either way, a request arriving then waited or was rejected. The displays round `peak / limit` down, so 100% never shows for a limit with room left, and show whether it was exhausted beside it.
- **A rate limit's use is option B, its bucket's level.** `limit` is the bucket's size (its burst), and `current` and `peak` count the tokens missing from a full bucket. The flow travels with it as context: `ratePerSec`, and `takenPerSec` for the window (in the totals, the busiest window's). Taking tokens faster than `ratePerSec` drains the bucket.
- The component contract checks every limit: the same limits on every read, concurrency use within its limit, a bucket holding between 0 and `burst` tokens, and no more tokens taken than the burst plus the rate since the start allow.
- RDS's `connectionsHeld` gauge is removed: its `connections` limit reports the same number, plus its peak and the limit itself.

**Why B, not A.** Requests are throttled one at a time, by the bucket's level when each arrives. Whether a second at 95% of the rate gets throttled depends on how its requests were spaced and how many tokens were saved up beforehand. That matters more once workloads have jittered spikes. The level is the state that causes a rejection, so it's the number a finding should be built on.

A per-second flow is an exact count, but it can't explain a throttle. It also goes over 100% while saved-up tokens cover the gap, which makes "use" mean something different for rate limits than for concurrency limits. B doesn't change how the simulation behaves: the bucket was already exact per request (fidelity APIGW-2). It changes what we report.

## Consequences

- Every limit reads the same way: `peak / limit` from 0 to 1, so findings and the "busiest component" verdict can compare an RDS pool with an API throttle. A bucket runs out just short of 1, at less than one token left, so "exhausted" comes from `limitExhausted`, not from the share. At Template scale (a burst of 5,000) the gap doesn't show; for a small DynamoDB table with a burst of a few units, it does.
- A bucket's level alone can't show sustained headroom. At 9,900 requests per second against a 10,000-per-second rate, the bucket stays full and its use reads 0%. That's why every rate limit carries its flow. Both tables show both, and a draining bucket runs out, below one token, in `(tokensLeft − 1) / (takenPerSec − ratePerSec)` seconds.
- Shape within a second is invisible: two seconds with the same lowest level look the same. Shorter metric windows would show more, if a finding ever needs it.
- The CLI report and the run panel share `limitPeaks` (`application/run-analysis/`, [ADR-0013](0013-derive-run-results-in-application-run-analysis.md)). The CLI's per-second table shows a component's limits in place of its "busy" column.
- Reading a bucket's level after every call must not change the run, so `RateLimit.available` only reads. Before this, it refilled the bucket, which could shift later refills by floating-point steps.
- A new component type with a limit declares it in its behavior. The engine, the collector, and both displays pick it up without changes.
- Whether AWS throttles exactly like our bucket (API Gateway's scope, DynamoDB's burst and adaptive capacity) is a fidelity question, tracked in [`docs/design/fidelity.md`](../design/fidelity.md). This ADR only decides what we report.
