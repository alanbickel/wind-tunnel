# ADR-0011: Draw metric charts with Recharts, behind our own components

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

M3 charts a run's metrics over simulated time: per component, arrivals, failures, in-progress count, and latency percentiles; per workflow, success and failure ([MVP design §4.3](../design/mvp-design.md#43-output-metrics-snapshots)). A run emits one snapshot per simulated second, so a 60-second run gives each series about 60 points. Charts must reconcile like the text report does: totals that add up, and in-progress work shown.

Chart libraries each have their own API: React components (Recharts), an imperative canvas API (uPlot), or a configuration object (ECharts). If a library's API spreads through the UI, replacing it means rewriting every chart.

## Decision

Use [Recharts](https://recharts.org/) (MIT). Its charts are declarative React components, which suits a React UI. It draws SVG, which is fast enough for hundreds of points per series.

**Only `src/ui/charts/` imports `recharts`.** That folder exports chart components whose props are our own types. The first is a `TimeSeriesChart`: a title, a unit for the y-axis, and series of `{ timeSec, value }` points, each with an ID and a label. More chart kinds are added there as needed.

Consumers, such as the run view, map metrics snapshots into those props. They never see a Recharts type.

ESLint enforces the boundary: importing `recharts` in `src/ui/` or `src/adapters/` outside `src/ui/charts/` is an error. (`domain/` and `application/` already reject every unapproved package.)

## Consequences

- Replacing Recharts means rewriting one folder. Consumers and their tests don't change.
- If runs grow to tens of thousands of points per series, SVG will slow down. The fix is a canvas library (such as uPlot) inside `src/ui/charts/`, or downsampling before charting.
- Chart props must not leak Recharts types. ESLint can't see that; reviewers check it.
- Recharts adds to the bundle; it is larger than canvas libraries like uPlot.
