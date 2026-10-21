# ADR-0015: Findings come from registered detectors; components declare what each limit does when it's full

- **Status:** Proposed
- **Date:** 2026-10-21

## Context

A run screen full of tables and charts leaves the diagnosis to the reader. M5's goal is that Wind Tunnel says it: what broke, where, when, why, and what would fix it, plus a verdict on every run, healthy ones included. The [findings design](../design/findings.md) wrote out what an expert would say about seven runs, then worked back to the rules that would produce each sentence. Several of the answers set precedents:

- **Sentences need knowledge that only a component type has.** "orders-db refused connections because waiting queries hold them" depends on RDS's rule that a query waiting for a worker keeps its connection. "orders-queue's consumers were full" isn't a problem, because waiting is what that limit is for. A detector that branched on component type would have to change for every new type, against Open/Closed.
- **A finding's cause can start long before it.** In one run, reads were throttled from 95 s to 141 s because the read bucket had been draining since 19 s. A detector that reads only the failing seconds can't say that.
- **The CLI and the run panel must say the same thing,** with the same numbers, as they already do for totals ([ADR-0013](0013-derive-run-results-in-application-run-analysis.md)). The panel also needs to link a finding to its component and its time window.
- **The evidence is part of the product.** A sentence about the run must quote numbers that reconcile with the totals. A claim about AWS must be Documented, Observed, or marked as an Assumption, as in `docs/design/fidelity.md`.

## Decision

**Findings are a read model in `src/application/run-analysis/findings/`, produced by registered detectors.**

- A `Detector` is `{ id, detect(run: RunSoFar): Finding[] }`, one per file. `createDetectors()` lists the defaults, as `createAwsComponentRegistry` lists component types, and `findRun(run, detectors)` runs them, nests each cause under the finding it explains, orders the findings, and adds the verdict. A new detector is a new file and one line in the list; nothing else changes.
- Detectors are generic: none branches on a component's type. What a type knows reaches them through its limit declarations, below, and through a catalog of fixes and AWS facts keyed by component type and limit.

**Components declare what each limit does when it's full.** Alongside ADR-0014's `LimitGauge`, a limit declares:

- whether it **refuses** work when full (RDS `connections`, Lambda `concurrency`, every token bucket) or **makes it wait** (RDS `queryWorkers`, SQS `consumerConcurrency`);
- for a limit that refuses, the **rejection reason** it produces (`too-many-connections`), so a failure cause can be matched to its limit;
- for a limit that makes work wait, **which other limit the waiting work holds**, if any (RDS `queryWorkers` → `connections`).

These are copied into each snapshot's `LimitUse`, so the read model needs only the snapshots and the project, as it does today.

**A finding has a fixed shape.** It has a severity (`failure`, `warning`, `note`), a component, a time window, a separate cause window that may start earlier, a summary, its reasons, the numbers it quotes (each with its source: totals, snapshots, or config), fixes, a link to an AWS fact, and the IDs of the findings it follows from. Its text is a list of parts (text, numbers with units, component references, times), worded in `application/` and formatted by the CLI and the UI. Display formatting stays outside `application/`, as ADR-0013 decided.

**Rules fire on exact states, not tuned thresholds:** a failed request, an exhausted limit, a message still waiting at a second's end, or a latency past a timeout the project sets. A percentile compared with a timeout says when the comparison is within the histogram's error.

**Every run has a verdict:** *failing* if any finding is a failure, *degraded* if any is a warning, otherwise *healthy*. It gives the request counts, and the limit closest to refusing work, with its peak and limit. A peak that came only during cold starts is given with that context, and never hidden.

**Every fix carries its evidence.** A fix is Documented (with a URL), Observed (with its source, such as a scenario test), or an Assumption, and names the fidelity entries that could change it. A test checks that each catalog entry has one.

## Consequences

- The CLI and the run panel can't disagree about what a run means, and a reconcile test can check the findings against the totals: the failure findings add up to the failed requests, cause by cause.
- A new component type gets findings without a detector change, as long as it declares its limits fully. Forgetting to declare a limit's behavior is caught where the type is defined: the component contract checks the declarations, as it checks the limits themselves.
- `LimitUse` grows three fields that never change during a run. They're small, and repeating them keeps every snapshot self-describing.
- `RunSoFar` must say whether the run has finished, because work left unfinished is a warning only at the end. It gains the workload ID.
- Some sentences an expert would say are out of reach: what-if claims ("at 250 requests a second, the workers fill"), claims about the architecture rather than the metrics ("the consumer cap keeps the database's connections down"), and exact counts above a latency. The design lists them; the catalog cites the tests that prove the what-if fixes until re-runs can.
- Wording now lives in `application/`, which only formatted numbers before. Changing a sentence changes the CLI report's snapshots, so the report tests catch accidental rewording.
