# ADR-0007: Metrics observe the engine through events and ticks; components expose named gauges and counters

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

A run must produce a metrics snapshot every simulated second ([MVP design §4.3](../design/mvp-design.md#43-output-metrics-snapshots)): per-component counts, latency percentiles, current and peak `inProgress`/`queueDepth`, and per-workflow success and latency. The UI will chart these, the headless runner will print them, and scenario tests will assert on them.

The engine already reports everything that happens as `SimulationEvent`s to an observer, so most counts can be derived from events. Three things can't:

- **Current state at a point in time.** `inProgress` and `queueDepth` live in each component's behavior; nothing in the event stream says what they are at t = 1000 ms.
- **Peaks within a second.** A queue can fill and drain between two samples.
- **Type-specific values.** Template A's lesson is RDS connection exhaustion, which needs "connections held" (running *and* waiting queries); Lambda cold starts happen inside `arrive`. [ADR-0006](0006-components-return-effects-to-the-engine.md) noted these "will need an extension when metrics are built". The engine must not learn about RDS or Lambda by name (Open/Closed).

## Decision

1. **Metrics are an observer, not part of the engine.** `MetricsCollector` (`src/domain/metrics/`) consumes `SimulationEvent`s and builds per-second `MetricsSnapshot`s and run totals. `simulateWithMetrics` wires the two together.
2. **The engine emits `tick` events when asked.** With `tickMs` set, the engine reports a `tick` every `tickMs` of simulated time and one at the end of the run. A tick carries a `ComponentSample` per component: current and peak `inProgress`/`queueDepth` since the last tick, plus gauges and counters. Ticks aren't put in the event queue; the loop emits each one before the first event at or after its time, so a tick at T closes the window `[T − tickMs, T)` exactly. The engine tracks peaks after each call into a component, which is cheap.
3. **Components may expose named `gauges` and `counters`.** `ComponentBehavior` gains two optional records. Gauges are values sampled at each tick (RDS `connectionsHeld`). Counters are running totals that never decrease (Lambda `coldStarts`); the collector reports the increase per window. The contract checker verifies that both are finite and that counters never decrease.
4. **Latency uses a fixed-bucket histogram** whose bucket width grows by 5% per bucket from 1 ms to 10 minutes (about 270 buckets). Memory stays constant however many requests run, windows merge into run totals by adding buckets, and percentiles are within about 5%.

## Consequences

- New component types can report their own metrics without engine changes; the UI and report show whatever names appear.
- Gauge and counter names are free-form strings, so a typo isn't caught by the compiler. Each definition's tests should assert its names.
- Gauges are sampled, so a gauge can miss a spike between ticks. `inProgress` and `queueDepth` have true peaks because the engine tracks them; type-specific gauges don't. If one needs a peak, the definition can track it and expose it as its own gauge.
- Snapshots hold percentile summaries, not histograms, so they stay small enough to post from a Web Worker each second. Percentiles over a custom range of seconds can't be recomputed from snapshots; only the run totals have whole-run percentiles.
- Runs without `tickMs` are unaffected, so existing traces and tests don't see ticks.
