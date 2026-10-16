# Implementation Plan

Tracks milestone progress for the MVP described in [`design/mvp-design.md`](design/mvp-design.md). Work happens one milestone at a time, and each new milestone usually starts in a fresh session, so this file is the source of truth for **where we are and what's next**.

## How to resume work (read this first)

1. Read `CLAUDE.md`, then this file.
2. Find the current milestone (the first one not marked ✅) and the first unchecked task in it.
3. Read the [Progress log](#progress-log) for decisions from earlier sessions, and CONTRIBUTING's [Gotchas](../CONTRIBUTING.md#gotchas).
4. Read only the docs the current task needs; don't re-derive settled decisions (see `docs/adr/`).

## How to finish a milestone

1. All tasks checked, and the milestone's "done when" criteria verified.
2. Docs updated: the architecture overview, the design doc if reality differs from it, new ADRs for significant decisions, a short onboarding guide for each new subsystem, and every new document listed in its folder's overview or the [root README](../README.md#documentation).
3. A short entry added to the [Progress log](#progress-log): what was built, what differs from the plan, and anything the next session needs to know.
4. **Compact this file:**
   - Replace the finished milestone's task list with a one-line summary and its commit range.
   - Trim older progress log entries to what a future session still needs. Anything already recorded in ADRs, design docs, or git history can go.
5. Refine the next milestone's tasks if what we learned changes them.
6. Commit, with the user's approval. The session can then be cleared.

## What belongs in this file

Only milestones, tasks, their status, and short log entries that future sessions need. Scratch notes, debugging details, and explanations belong in the conversation, in commit messages, or in the relevant doc, not here. Keep it short enough to read in a minute.

---

## M0: Project scaffolding ✅

Vite + React + strict TS, Vitest, ESLint layer rules, Prettier, `npm run check`, GitHub Actions CI, README, LICENSE; project renamed to Wind Tunnel and published at `alanbickel/wind-tunnel`. Commits `e976b3c`..`1fdb22b`.

## M1: Domain model and engine, headless ✅

Seeded randomness, event queue, behavior primitives, domain entities and validation, component registry and contract suite, the five AWS types, the engine, metrics, the v1 document schema and `loadProject`, Templates A and B, `npm run simulate` with a reconciling text report, scenario tests, and a tuning pass (results in MVP design §7). Commits `ef21c6c`..`3791bb2`, plus the tuning commit that closes M1.

## R1: Coding-standards refactor ✅

Brought all existing code in line with the CONTRIBUTING coding standards, with no behavior change (trace and report snapshots unchanged apart from the `LatencySummary` unit renames), then made the ESLint coding-standard rules errors. Commits `236db0c`..`3f56a87`, plus the commit that closes R1.

Decisions that still apply: rule 7 applies to component methods (no exception). Component config fields in seconds (`idleTimeoutSec`, `burstSec`) stay as they are; each component converts its own.

## M2: Application layer and persistence ✅

Ports, `ProjectRecord`s and the document mapper (ADR-0008), document migration scaffolding, the bundled template catalog, the IndexedDB repository, the seven MVP use cases, the in-process simulation runner (the CLI now runs through `RunSimulation`), the `StoragePersistence` port, and the [application layer guide](architecture/application-layer.md). Commits `62e12f2`..`5641ff8`, plus the commit that closes M2.

## R2: Maintainability

**Goal:** make the code and docs easier for a new maintainer to navigate before the UI adds more. Except for the renames in R2.4 and R2.9, nothing changes behavior.

**Done when:**
- `npm run check` passes and `npm run lint` shows no `max-lines` warnings.
- The trace and report snapshots are unchanged, apart from the renames in R2.9, each reviewed.
- The million-event engine test is within noise of its pre-R2 time (see the R1 log for how to measure).
- A newcomer can get from the docs hub to the right doc for their task in one click.

**Rules for every task:** one `refactor` or `docs` commit per task, each with the user's approval. Code moves without being rewritten, apart from the change the task names. Run `npx tsc -b` and the full test suite before each commit. Apply new conventions to new code from the moment they're adopted.

- [x] **R2.1 Lint: `max-lines` warning.** Add ESLint `max-lines` at 400 (skipping blank lines and comments) as a `warn`, covering tests too. Expect warnings on `simulation.ts`, `check-component-contract.ts`, and `traces.test.ts` until R2.5, R2.6, and R2.10 clear them. Explain the rule in CONTRIBUTING §Enforcement: a warning means "consider splitting", not "must fix".
- [x] **R2.2 Rule: collaborators come from factories.** Write ADR-0009: no class or method creates its own dependencies. A *dependency* is any object with behavior that the code delegates to (`EventQueue`, `ArrivalProcess`, `RateLimit`, `ServiceTime`, `ConcurrencyLimit`, `SeededRandom`, `MetricsCollector`). These come in through the constructor, built by a factory function or builder. *State* may be created in place: built-ins (`Map`, `Set`, arrays), plain records (`Visit`, `Attempt`), and pure accumulators that only store data (`LatencyHistogram`, `Tally`, the `Queue` inside `ConcurrencyLimit`). Factories (`simulate`, `ComponentDefinition.build`, `createAwsRegistry`) and composition roots (the CLI command, `main.tsx`, tests) are where `new` belongs. Add it to CONTRIBUTING as rule 10. If an ESLint `no-restricted-syntax` selector (`NewExpression` inside a class body, with built-ins and `*Factory`/`*Builder` classes allowed) is workable, enforce it as an error. If not, note it as a manual check. *Done, widened:* dependencies are also typed as interfaces (the interface named for the role, the class named for how it works), checked by `tests/architecture/dependency-types.test.ts` on every `*Dependencies` type. `ComponentRegistry` became an interface implemented by `ComponentRegistryMap` in a refactor commit first.
- [x] **R2.3 Convention: names for parameter objects.** Extend CONTRIBUTING rule 8. `<Name>Input` is the single data object a function, method, or constructor takes. `<Class>Dependencies` is a constructor's collaborators. `<Name>Context` is state shared across a family of functions, such as a validation walk, and stays as the second parameter. Retire `Options`, `Settings`, and `At` (fold `EdgeAt`/`StepAt`/`WorkloadAt` into their function's `Input`). `BuildContext` is public component API and keeps its name.
- [x] **R2.4 Rename parameter types** to the R2.3 convention across `src/`, in one commit. Renaming only, no signature changes. Each `*At` type becomes `<Subject>Input` (`StepAt` → `StepInput`), because several functions share it. Also: `RateLimitOptions`, `ConcurrencyLimitOptions`, `ContractOptions`, and `ScenarioSettings` (named for what it holds). Constructor collaborator types renamed to `*Dependencies` (such as the adapters' `InProcessSimulationRunnerInput`) come under the dependency-types test; check it still passes. *Done:* a constructor object holding any collaborator became `*Dependencies`, even alongside data (`ArrivalProcess`, `BundledTemplateCatalog`, `ContractHarness`). `ScenarioSettings` → `ContractScenario`, the CLI's `Options` → `FlagValues`.
- [x] **R2.5 Split the engine** (`simulation.ts`, 780 lines; target about 300):
  1. Move the public types (`SimulationEvent` and its variants, `Failure`, `ComponentSample`, `SimulationInput`, `SimulationResult`) to `engine/simulation-events.ts`, and update the imports in metrics, traces, the CLI, and application.
  2. Add a `Topology` built from the project and registry. It holds `component(id)`, `edgeFor(from, to)`, and `workflow(id)`, plus their "No component/edge/workflow" errors, and absorbs `buildComponents`, `indexEdges`, `edgeKey`, and `findWorkload`.
  3. Add a `TickSampler` that owns `tickMs`, `nextTickMs`, `ticksBefore`, `finalTick`, `trackPeaks`, and `sampleAndResetPeaks`.
  4. Add `createSimulation(input)` in its own file. It builds the random streams (keeping today's creation order, which scripted tests rely on), `Topology`, `TickSampler`, `EventQueue`, and `ArrivalProcess`, and passes them to `new Simulation(dependencies)`. `simulate()` calls it. `SimulationDependencies` holds interfaces (ADR-0009): extract one for each of `Topology`, `TickSampler`, `EventQueue`, and `ArrivalProcess`, and use `RandomSource` for the streams. Remove the R2.5 disable comments.
  5. Leave the call → attempt → visit flow in `Simulation` and don't split it further. Re-assess once 1–4 are done.
  Check speed against the million-event test after this task.

  *Done:* interfaces were extracted as each piece was added, not all in step 4. Implementations: `ProjectTopology` (built by `buildTopology`; `findWorkload` sits beside it, because the workload's seed is needed before the components), `IntervalTickSampler`, `HeapEventQueue`, and `PoissonArrivalProcess` (moved to its own file, clearing its R2.15 exception). The call records moved to `runtime-records.ts`. `simulate` moved with `createSimulation` to `create-simulation.ts`, avoiding a circular import. Step 5 left the flow whole and added `NoTickSampler`: `createSimulation` picks it when `tickMs` is unset, so `IntervalTickSampler` no longer checks for `undefined`, and untimed runs skip peak tracking. `simulation.ts` is 448 lines (about 380 counted); moving `EngineEvent` out is deferred to R2.9. The million-event test is within noise of before (alternating runs, 1.3–2.3 s either way).
- [x] **R2.6 Split the contract checker** (535 lines). Move `ContractHarness` and its types to `contract-harness.ts`. Its `EventQueue` and `SeededRandom`s come from a factory, typed as interfaces (ADR-0009); remove the R2.6 disable comments. Add a doc block to the harness explaining why it has its own small event loop: it checks a component independently of the real engine, so an engine bug can't hide a component bug. Leave the public `checkComponentContract` API where it is.

  *Done:* `createContractHarness` in `contract-harness.ts` is the factory. It also builds the behavior under test (`definition.build`, which the lint selector can't see), so `ContractHarnessDependencies` holds the definition, scenario, behavior, `EventQueue`, and `RandomSource`; the old data-only shape became `ContractHarnessInput`. `checkComponentContract` re-exports `ContractStats`. The checker is 119 lines and the harness 466 (under the 400 counted).
- [x] **R2.7 Split the metrics collector** (404 lines). Move `ComponentTally`, `WorkflowTally`, and `Tally` to `component-tally.ts`, `workflow-tally.ts`, and `tally.ts` (rule 11), and remove the R2.7 exceptions. `simulateWithMetrics` stays the factory that builds the collector.

  *Done:* the snapshot types (`ComponentMetrics`, `WorkflowMetrics`, `MetricsSnapshot`) moved to `metrics-snapshot.ts` so the tallies don't import from the collector. The collector re-exports them, so their importers are unchanged. The collector is 147 lines.
- [x] **R2.8 AWS behaviors receive their primitives.** Each `definition.build()` constructs the `RateLimit`/`ServiceTime`/`ConcurrencyLimit` instances and passes them to the behavior's constructor, so behaviors no longer create them. The same goes for the test fakes in `components/testing/fake-definitions.ts` and DynamoDB's `capacityBucket` helper (which the lint selector can't see). Move each behavior class to its own file (`lambda-behavior.ts`, and so on, rule 11). Remove the R2.8 disable comments and exceptions. Behaviors take `<Behavior>Dependencies` of interfaces: `RateLimit`, `ServiceTime`, and `ConcurrencyLimit` become interfaces, and the classes take mechanism names (for example `TokenBucket implements RateLimit`; confirm the names with the user). The contract suite and template scenarios must stay green.

  *Done, in two commits:* first the interfaces, implemented by `TokenBucket`, `SampledServiceTime`, and `CountingSemaphore`; then the wiring and the moves. Lambda's `build` now converts `idleTimeoutSec` to the behavior's `idleTimeoutMs`. `MessageQueueBehavior` has no collaborators, so it takes a `MessageQueueBehaviorInput`. Rule 11 named DynamoDB's file `dynamo-db-behavior.ts`. The trace text still says `RateLimit {…}` and `ConcurrencyLimit {…}`, naming the role.
- [x] **R2.9 Name events by their subject.** Public `SimulationEvent` kinds name their subject (`component-arrived`, …, `edge-attempt-failed`, `metrics-tick`; `workflow-*` unchanged), with types to match (`ComponentArrivedEvent`, `MetricsTickEvent`). The engine's internal `EngineEvent` became `ScheduledWork` in `scheduled-work.ts` (`user-due`, `attempt-reaches-target`, `visit-service-done`, `attempt-answered`, `attempt-timed-out`, `call-retry-due`, `visit-nothing-to-deliver`), so a type ending in `Event` is always one the observer sees.

  *Done:* the harness's `HarnessEvent` became `HarnessScheduledWork`, and its kinds were renamed too (`request-due`, `visit-service-done`, `delivery-finished`). Component effect kinds (`started`, `queued`, …) are unchanged. The trace rows are prose written by the trace test, not kind strings, so every snapshot is byte-identical. Only ADR-0007 got an addendum, since ADR-0006 quotes no event kinds. `simulation.ts` is 415 lines.
- [x] **R2.10 Split the trace tests** (`traces.test.ts`, 761 lines). One test file per subsystem in `src/domain/traces/`, with the shared formatters in `traces/format.ts`. The `.txt` outputs stay byte-identical. Update the guides' "refresh with" commands.

  *Done:* one test file per guide (`simulation-engine`, `component-definitions`, `domain-model`, `metrics`). Only `table` is shared, so it's all `format.ts` holds; it keeps its three parameters under a disable comment, since `max-params` is off only in test files. `showEffects` and `journeyText` stay with their one user. Every snapshot is byte-identical.
- [x] **R2.11 Glossary.** Add `docs/glossary.md`: every domain term in one or two lines (Project, Architecture, Component, Edge, Workflow, Step, Workload, Request, Call, Attempt, Visit, Effect, Behavior, Definition, Registry, Tick, Snapshot, Record, Document). Include one diagram of how the runtime nouns nest (a request makes calls, a call makes attempts, an attempt becomes a visit at a component, a visit returns effects). Link it from the docs hub, the root README, and the top of the engine guide.

  *Done:* also Run, Template, and Event (`ScheduledWork` vs. `SimulationEvent`). The architecture overview's "Core concepts" table became a two-line summary pointing to the glossary, so the terms live in one place; its diagram stays. The glossary is first in the hub's reading order.
- [x] **R2.12 C4 diagrams.** First check that Mermaid's `C4Context`/`C4Container`/`C4Component` render legibly on GitHub and in the VS Code preview. If they don't, draw `flowchart`s that follow C4's conventions (each box labeled with its kind, plus a legend). Add one diagram per level, no more:
  - Level 1 (context) and level 2 (containers): browser app, IndexedDB, Worker (planned), CLI. These go in the architecture overview.
  - Level 3 (components): one per guide (engine, component definitions, metrics, application layer).
  - Level 4 (code): a Mermaid `classDiagram` for each split from R2.5–R2.7, showing the class, its collaborators, and the factory that wires them.
  Add a line to CONTRIBUTING §Documentation saying which level goes where.

  *Done:* Mermaid's C4 diagrams placed labels over boxes and boundaries even after hand-ordering, so all are flowcharts, with a legend and the `classDef`s in the overview's "The system at a glance". The level 3 diagrams replaced the first diagram in the components, metrics, and application layer guides rather than adding to them; the engine guide's goes beside its pieces table. Level 4 covers `createSimulation`, `createContractHarness`, and `simulateWithMetrics`. Checked by rendering with `npx @mermaid-js/mermaid-cli`.
- [x] **R2.13 One map for the docs.** Rewritten with the user: the root README is the map of every document; a `docs/` folder may have one `<folder>-overview.md`, and the root README links only to that overview; `docs/README.md` became [`getting-started.md`](getting-started.md) (setup, reading order, first change); all curation guidance lives in CONTRIBUTING §Documentation, and CLAUDE.md points to it.

  *Done:* `architecture/README.md` → `architecture-overview.md`, which now lists its guides; the ADR table moved to `adr/adr-overview.md`; ADR-0002 got an addendum for the moved overview. The "I want to…" routes weren't added: the overview's "Where does my code go?" table already does that job, and getting started points to it. Stale text cut: the README's status, the overview's status blurb and its "Planned" section's intro, and a "What Wind Tunnel does" section that repeated the README.
- [x] **R2.14 Move the gotchas.** Move the progress log's "Gotchas (still apply)" into a CONTRIBUTING "Gotchas" section, and delete it from this file.

  *Done:* only two needed the new section (`erasableSyntaxOnly`, the TypeScript pin). The rest were already written down: Vitest in §Setup, float drift in §Tests (percentiles added beside it), and effects without timers or cancellation in the engine and component guides. The ADR rename exception went to §ADRs.
- [ ] **R2.15 One class per file** (rule 11). Move the classes still listed under R2.15 in `tests/architecture/class-files.test.ts`: the five fakes in `application/testing/fake-ports.ts` to a file each, `SeededRandom` to `seeded-random.ts` (`RandomSource` stays in `random-source.ts`), and `indexeddb-project-repository.ts` to `indexed-db-project-repository.ts`. Remove the R2.15 exceptions and disable comment. Moves and renames only.

## M3: Minimal UI

**Done when:** in the browser, a user can create a project from a template, view its architecture, run its workload, and see charts.

- [ ] ADRs: canvas library and chart library
- [ ] Browser `Clock` (`new Date().toISOString()`) and `IdGenerator` (`crypto.randomUUID()`) adapters
- [ ] Composition root in `src/main.tsx` (open the database, build the adapters and use cases) and an app shell that provides the use cases through React context
- [ ] Project list and "new from template"; opening an `invalid` project shows its `reason` and issues
- [ ] Read-only architecture view
- [ ] Web Worker `SimulationRunner` adapter. Add cancellation to the port (stop a run, terminate the Worker); M2's port has none because `AbortSignal` isn't in the ECMAScript-only lib `application/` is checked with
- [ ] Run controls and metric charts
- [ ] Call `StoragePersistence.request()` after the user's first project is created (Firefox prompts, so not at startup); if it isn't `persisted`, point to export
- [ ] Onboarding guide for the UI: the composition root, how components reach use cases, the Worker runner, and a run traced from click to chart

---

## Progress log

Newest first. Record what was built, what differs from the plan, and what the next session needs to know.

### 2026-10-15: M2 complete

- **Read [the application layer guide](architecture/application-layer.md)** before M3: the ports, which adapters fill them, records vs. documents, and a project traced end to end ([`src/adapters/traces/`](../src/adapters/traces/), refresh with `npx vitest run -u src/adapters/traces`).
- **Differs from the plan:** `LoadProject` became `OpenProject`, and `ListTemplates` is new (MVP design §5.2). `RunSimulation` takes a `Project`, not an ID. Nothing calls `StoragePersistence` yet; M3 calls it after the first project is created, because Firefox prompts.
- **Still missing for the browser:** `Clock` and `IdGenerator` adapters, the Worker runner, and the composition root (all in M3). The `blocked`/`blocking` case when a newer build upgrades the database while another tab holds it is in TODO.md; it matters once there's a database version 2.
- **Shapes to follow:** one class per use case, ports in the constructor as one object, work in `execute`, results as `status` unions. A new port gets a fake in `src/application/testing/`. Adapters reading stored or imported JSON go through `loadProject`.
- **Tests:** IndexedDB tests `import "fake-indexeddb/auto"`, then `vi.stubGlobal("indexedDB", new IDBFactory())` in `beforeEach` and close the database in `afterEach`. Each test body stays within 30 lines; split a long scenario into named steps.

### 2026-10-15: R1 complete

- **Lint is strict:** a coding-standard violation fails `npm run lint` and CI. An exception needs a disable comment with its reason after `--`.
- **Helpers:** `src/domain/shared/kind-handlers.ts` has `KindHandlers`/`handleKind` for discriminated unions and `lookup` for `Record` tables. Tests can use `workflowIn`/`componentIn` (`src/domain/metrics/testing/`) instead of chains of `?.`.
- **Measuring speed:** whole-template timings swing ±30% between runs. Compare the million-event test instead, alternating with `git stash`: `npx vitest run src/domain/engine/simulation.test.ts -t "loops without advancing" --reporter verbose`.
- **Scripted edits:** Python isn't installed, and Git Bash strips backslashes inside heredocs, which breaks regexes. Write such scripts to a file first.

### 2026-10-15: M1 complete

- **Templates:** `template-scenarios.test.ts` asserts each template's lesson by phase on seeds 42, 7, and 2026; a template change that alters its lesson must update it. Tuning results are in MVP design §7. Refresh the report snapshots with `npx vitest run -u src/adapters/cli`; every total in the report reconciles (`report-reconciles.test.ts`).
- **Headless runner:** `scripts/simulate.js` loads TypeScript with Vite's experimental `runnerImport` (about 2 s startup), not `tsx`.
- **Known model gaps** (in TODO.md and `docs/design/fidelity.md`): SQS has no visibility timeout, Lambda cold starts are checked lazily on arrival, and Template A understates AWS (LMB-8, RDS-2, RDS-4).
