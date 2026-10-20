# ADR-0013: Derive what a run means in `application/run-analysis/`

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

A run produces `MetricsSnapshot`s, one per simulated second. Two places turn them into something a person reads: the run panel in `ui/` and the text report in `adapters/cli/`. Each computed the per-second request counts, the running total in progress, and the totals itself, and the copies differed only in names ([#20](https://github.com/alanbickel/wind-tunnel/issues/20)). The two agree only while the copies stay in step, so a later change to what counts as "in progress" (retries, async work) could reach one and not the other.

More derived data is coming. M5 adds each component's use of its own limits ([#46](https://github.com/alanbickel/wind-tunnel/issues/46)) and then findings: sentences such as "orders-db ran out of connections from 21 s to 39 s", produced by detectors that read a run ([#47](https://github.com/alanbickel/wind-tunnel/issues/47)). Both the browser and the CLI should show the same findings.

The shared code needs a home that both `ui/` and `adapters/` can import:

- **`domain/metrics/`** is out. `ui/` may import only types from `domain/` (ADR-0002), so the run panel couldn't call it.
- **`ui/`** is out. `adapters/` must not import from `ui/`.
- **`application/`** works. Both outer layers import from it, and it is already checked for determinism, so the same snapshots always give the same results.

## Decision

Code that derives results from a run lives in **`src/application/run-analysis/`**. It is a read model: pure functions from a `RunSoFar` (the project and the snapshots received so far) to plain data. It has no ports and no use cases, and it never changes the run.

- Every count the browser and the CLI both show is computed there once. Today that's `requestsInProgress` and `unfinishedWork` (`counts.ts`), `workflowSeconds`, and `workflowTotals`, `allWorkflows`, and `componentTotals`.
- The functions take the snapshots received so far, not only a finished run, so the browser can call them while a run is still going.
- Formatting stays in the outer layers: the CLI turns the results into text tables, and the UI turns them into charts and React tables. Unit conversion for display (milliseconds to seconds) happens there too.
- Findings and their detectors will live here too, registered rather than hard-coded, in line with Open/Closed. Their shape is #47's to design.
- A reconcile test checks the shared sums against the collector's own totals on every template: [`src/adapters/templates/run-analysis-reconciles.test.ts`](../../src/adapters/templates/run-analysis-reconciles.test.ts). It lives in `adapters/` because loading a template needs `loadProject`.

## Consequences

- The browser and the CLI can't disagree about a count, because there is only one implementation of it.
- A new derived number has an obvious home, and it's tested in Node without React or a terminal.
- `application/` now holds two kinds of code: use cases with ports, and this read model. The architecture overview's "Where does my code go?" table says which goes where.
- Derived data that only one screen shows can still live in `ui/` (for example `runCharts`, which shapes series for one chart). When a second consumer needs it, move it here.
