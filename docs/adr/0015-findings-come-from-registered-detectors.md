# ADR-0015: Findings come from registered detectors; components declare what each limit does when it's full

- **Status:** Accepted; amended 2026-10-23
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
- A detector returns whole findings, and `findRun` nests them only by cause. A sentence that adds to another detector's finding, such as which limit refused the failed requests, is a helper that detector calls, not a registered detector.
- Detectors are generic: none branches on a component's type. What a type knows reaches them through its limit declarations, below, and through a catalog of fixes and AWS facts keyed by component type and limit.

> **Changed by the [addendum of 2026-10-22 (failed deliveries)](#addendum-2026-10-22-failed-deliveries).**

**Components declare what each limit does when it's full.** Alongside ADR-0014's `LimitGauge`, a limit declares:

- whether it **refuses** work when full (RDS `connections`, Lambda `concurrency`, every token bucket) or **makes it wait** (RDS `queryWorkers`, SQS `consumerConcurrency`);
- for a limit that refuses, the **rejection reason** it produces (`too-many-connections`), so a failure cause can be matched to its limit;
- for a limit that makes work wait, **which other limit the waiting work holds**, if any (RDS `queryWorkers` → `connections`).

These are copied into each snapshot's `LimitUse`, so the read model needs only the snapshots and the project, as it does today.

**A finding has a fixed shape.** It has a severity (`failure`, `warning`, `note`), a component, a time window, a separate cause window that may start earlier, a summary, its reasons, the numbers it quotes (each with its source: totals, snapshots, or config), fixes, a link to an AWS fact, and the IDs of the findings it follows from. Its text is a list of parts (text, numbers with units, component references, times), worded in `application/` and formatted by the CLI and the UI. Display formatting stays outside `application/`, as ADR-0013 decided.

> **Changed by the [addendum of 2026-10-22](#addendum-2026-10-22).**

> **Changed by the [addendum of 2026-10-23](#addendum-2026-10-23).**

**Rules fire on exact states, not tuned thresholds:** a failed request, an exhausted limit, a message still waiting at a second's end, or a latency past a timeout the project sets. A percentile compared with a timeout says when the comparison is within the histogram's error.

**Every run has a verdict:** *failing* if any finding is a failure, *degraded* if any is a warning, otherwise *healthy*. It gives the request counts, and, unless the run is failing, the limit closest to refusing work, with its peak and limit. A peak that came only during cold starts is given with that context, and never hidden.

> **Changed by the [addendum of 2026-10-22 (failed deliveries)](#addendum-2026-10-22-failed-deliveries).**

**Every fix carries its evidence.** A fix is Documented (with a URL), Observed (with its source, such as a scenario test), or an Assumption, and names the fidelity entries that could change it. A test checks that each catalog entry has one.

## Consequences

- The CLI and the run panel can't disagree about what a run means, and a reconcile test can check the findings against the totals: the failure findings add up to the failed requests, cause by cause.
- A new component type gets findings without a detector change, as long as it declares its limits fully. Forgetting to declare a limit's behavior is caught where the type is defined: the component contract checks the declarations, as it checks the limits themselves.
- `LimitUse` grows three fields that never change during a run. They're small, and repeating them keeps every snapshot self-describing.
- `RunSoFar` must say whether the run has finished, because a queue backlog still waiting is a warning only at the end. Requests still in progress when a run ends are normal and appear only in the verdict's counts. `RunSoFar` gains the workload ID.
- Some sentences an expert would say are out of reach: what-if claims ("at 250 requests a second, the workers fill"), claims about the architecture rather than the metrics ("the consumer cap keeps the database's connections down"), and exact counts above a latency. The design lists them; the catalog cites the tests that prove the what-if fixes until re-runs can.
- Wording now lives in `application/`, which only formatted numbers before. Changing a sentence changes the CLI report's snapshots, so the report tests catch accidental rewording.

## Addendum, 2026-10-22

**Context.** The decision above gives a finding "the IDs of the findings it follows from", but not who writes them. The detector that owns a failure can't: it doesn't see the other detectors' findings, and if it predicted their IDs, every new cause detector would mean editing it. Running the detectors in order would make the rules depend on each other, against the findings design's "the rules have no order" ([§2.4](../design/findings.md#24-how-a-failure-reaches-a-finding)). The IDs were also strings that joined a detector's ID and its subject (`"failed-requests:orders-db: too-many-connections"`), so a reader had to parse them to learn the component or reason. Found while building the first cause notes ([#67](https://github.com/alanbickel/wind-tunnel/issues/67)).

**Decision.**

- **A finding's identity is a key, not a string.** `FindingKey` is a `kind` (the ID of the detector that made it, which replaces `detectorId`), the `componentId` (which replaces the finding's own), and the typed values that tell two findings of a kind apart at one component: a rejection `reason` or a `limitName`, each optional. Keys are compared field by field, never joined into a string, and the final tiebreak in the findings' order compares them field by field, by code unit.
- **A finding says which of its component's limits it's about** (`limitNames`), if any: the limits that refused its failed requests, or the one a note reads.
- **A cause note says what it explains** (`explains`): a component and, optionally, one of its limits. The limit is optional because reasons belong to components, not limits ([ADR-0016](0016-component-types-list-every-rejection-reason.md)): a timeout has no limit.
- **`findRun` fills `causedBy`,** a list of keys: each note goes beneath every other finding at the component it explains, about the limit it names if it names one. A detector returns findings without `causedBy` (`DetectedFinding`), so no detector knows another exists.
- **A cause doesn't repeat what's above it.** Where a note shows beneath a finding, the fixes and the Learn-more link that the finding above already shows are left out of the note. A fix counts as the same when it's the same catalog entry.

**Consequences.**

- A new cause detector is still one file and one line in `createDetectors`. It names what it explains; the finding it explains doesn't change.
- One note can show beneath several findings: a note that names no limit shows beneath every finding at its component, such as a refusal and a timeout there.
- Consumers that need a finding's component or reason read the key's fields. Turning a kind into words for the run panel is Roadmap item 10.
- The shape in the [findings design §3.1](../design/findings.md#31-a-finding) still shows `id` and `detectorId`; its "As built" notes say what changed.

## Addendum, 2026-10-22 (failed deliveries)

**Context.** A queue's delivery can fail when a component it calls refuses, and the queue tries the message again, so no request fails ([findings design §1.8](../design/findings.md#18-variant-template-b-lunch-rush-database-connections-cut-to-10-healthy-with-failed-deliveries)). Two points above don't fit that run. The verdict quotes "the limit closest to refusing work" as headroom, but there the limit was out and refused 90 attempts: it read "at most 10 of 10 (100.0%)", which hides the refusals. And the fix that belongs to a failed delivery, a redrive policy with a dead-letter queue, is advice about the queue under that kind of finding, not about the refusing limit, so a catalog keyed only by type and limit has nowhere to put it. Found while designing the failed-deliveries finding ([#69](https://github.com/alanbickel/wind-tunnel/issues/69)).

**Decision.**

- **A run that isn't failing names a refusing limit that ran out while its component refused work,** instead of quoting the limit closest to refusing work. The line gives the limit, the seconds it was out, how many attempts its component refused in those seconds, and that no request failed with its rejections. A limit that reached its size but refused nothing still has headroom of 0, and keeps the "closest to failing" line at 100.0%. That line still names the highest share among the refusing limits that didn't refuse, so a run can show both lines. The rule is the same for every run, not only those with queues.
- **The catalog is also keyed by component type and finding kind,** for fixes that depend on what happened at a component rather than on one of its limits, such as SQS's redrive policy under failed deliveries.

**Consequences.**

- The verdict reads each refusing component's `rejected` per snapshot, alongside its limits' peaks.
- `rejected` doesn't split refusals by limit, so when two refusing limits of one component ran out (DynamoDB's read and write buckets), the line names both with one count.
- A finding's fixes can come from two catalog entries, the limit's and the kind's. The rule that a note leaves out fixes already shown above it still compares catalog entries.

## Addendum, 2026-10-23

**Context.** The point above has each detector word its own sentences as `Message`s. The run panel needs a finding at two lengths: in full in its list, and short in the verdict's line, as in "All 273,539 answered requests succeeded, but work queued in orders-queue finished past the 29 s api waits for fn-api" ([PR #64 review](https://github.com/alanbickel/wind-tunnel/pull/64)). With sentences built inside the detectors, a second length means a second set of sentences in every detector. A consumer that wants what a finding says rather than its words, such as a test or a filter, also has to read the words. And the detectors printed a type's raw IDs (`too-many-connections`, `queryWorkers`), with nowhere for a type to say how they read. Found while planning the findings panel ([#77](https://github.com/alanbickel/wind-tunnel/issues/77)).

**Decision.**

- **A finding says what it means as values, not words.** Its `summary` and each of its `reasons` are `Statement`s: a `kind` and the numbers, components, times, and IDs the sentence quotes, the same numbers its `evidence` gives. The verdict's `summary`, `noHeadroomLine`, and `headroomLine` are statements too.
- **A phrasebook words them.** `createPhrasebook` builds one for a project from the detectors and the verdict's phrases. `word(statement, length)` returns a `Message`, still in parts, so formatting stays outside `application/`. Every phrase has a `long` form, the whole sentence, and a `short` one, a clause with no closing period that reads after "but". Both are required, with no fallback between them, so the consumer picks the length and the phrasebook doesn't know which consumer is asking.
- **A detector registers its phrases.** `Detector` gains `phrases`, a lookup table keyed by statement kind, which sits beside it in its `-phrases` file. A new detector is still one file, now with its phrases beside it, and one line in `createDetectors`. Helpers that two detectors share, such as limit-refused, export their phrases, and both detectors register the same table; two different phrases for one kind are an error.
- **A type words what only it knows.** Each type's catalog entry registers words, at both lengths, for its rejection reasons and its limits, as it registers fixes. A reason or limit its type doesn't register prints as its raw ID. As first shipped, every type's words are its raw IDs, so the CLI report doesn't change.

Fix messages, already written once per type in the catalog, stay `Message`s, and `Evidence.what` stays a string.

**Consequences.**

- The CLI asks for long forms and prints what it printed before; the run panel can quote a finding's short form after the verdict's.
- Detector tests assert the values a finding carries; each `-phrases` file has tests that word its statements at both lengths. Rewording a sentence no longer touches a detector.
- About fifty statement kinds, each with two forms to write and keep in step. Each `-phrases` test checks that every kind its table registers has a case, so neither form changes unseen.
- The `Phrase` methods are typed per statement, but a table of every kind is typed loosely, so a phrase can sit in it; the phrasebook only hands a phrase the statements of its own kind.
