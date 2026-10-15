# Implementation Plan

Tracks milestone progress for the MVP described in [`design/mvp-design.md`](design/mvp-design.md). Work happens one milestone at a time, and each new milestone usually starts in a fresh session, so this file is the source of truth for **where we are and what's next**.

## How to resume work (read this first)

1. Read `CLAUDE.md`, then this file.
2. Find the current milestone (the first one not marked ✅) and the first unchecked task in it.
3. Read the [Progress log](#progress-log) for decisions and gotchas from earlier sessions.
4. Read only the docs the current task needs; don't re-derive settled decisions (see `docs/adr/`).

## How to finish a milestone

1. All tasks checked, and the milestone's "done when" criteria verified.
2. Docs updated: the architecture overview, the design doc if reality differs from it, new ADRs for significant decisions, a short onboarding guide for each new subsystem, and the [docs hub](README.md) listing any new documents.
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
- [ ] **R2.2 Rule: collaborators come from factories.** Write ADR-0009: no class or method creates its own dependencies. A *dependency* is any object with behavior that the code delegates to (`EventQueue`, `ArrivalProcess`, `RateLimit`, `ServiceTime`, `ConcurrencyLimit`, `SeededRandom`, `MetricsCollector`). These come in through the constructor, built by a factory function or builder. *State* may be created in place: built-ins (`Map`, `Set`, arrays), plain records (`Visit`, `Attempt`), and pure accumulators that only store data (`LatencyHistogram`, `Tally`, the `Queue` inside `ConcurrencyLimit`). Factories (`simulate`, `ComponentDefinition.build`, `createAwsRegistry`) and composition roots (the CLI command, `main.tsx`, tests) are where `new` belongs. Add it to CONTRIBUTING as rule 10. If an ESLint `no-restricted-syntax` selector (`NewExpression` inside a class body, with built-ins and `*Factory`/`*Builder` classes allowed) is workable, enforce it as an error. If not, note it as a manual check.
- [ ] **R2.3 Convention: names for parameter objects.** Extend CONTRIBUTING rule 8. `<Name>Input` is the single data object a function, method, or constructor takes. `<Class>Dependencies` is a constructor's collaborators. `<Name>Context` is state shared across a family of functions, such as a validation walk, and stays as the second parameter. Retire `Options`, `Settings`, and `At` (fold `EdgeAt`/`StepAt`/`WorkloadAt` into their function's `Input`). `BuildContext` is public component API and keeps its name.
- [ ] **R2.4 Rename parameter types** to the R2.3 convention across `src/`, in one commit. Renaming only: no signature changes beyond folding `*At` types.
- [ ] **R2.5 Split the engine** (`simulation.ts`, 780 lines; target about 300):
  1. Move the public types (`SimulationEvent` and its variants, `Failure`, `ComponentSample`, `SimulationInput`, `SimulationResult`) to `engine/simulation-events.ts`, and update the imports in metrics, traces, the CLI, and application.
  2. Add a `Topology` built from the project and registry. It holds `component(id)`, `edgeFor(from, to)`, and `workflow(id)`, plus their "No component/edge/workflow" errors, and absorbs `buildComponents`, `indexEdges`, `edgeKey`, and `findWorkload`.
  3. Add a `TickSampler` that owns `tickMs`, `nextTickMs`, `ticksBefore`, `finalTick`, `trackPeaks`, and `sampleAndResetPeaks`.
  4. Add `createSimulation(input)` in its own file. It builds the random streams (keeping today's creation order, which scripted tests rely on), `Topology`, `TickSampler`, `EventQueue`, and `ArrivalProcess`, and passes them to `new Simulation(dependencies)`. `simulate()` calls it.
  5. Leave the call → attempt → visit flow in `Simulation` and don't split it further. Re-assess once 1–4 are done.
  Check speed against the million-event test after this task.
- [ ] **R2.6 Split the contract checker** (535 lines). Move `ContractHarness` and its types to `contract-harness.ts`. Its `EventQueue` and `SeededRandom`s come from a factory (R2.2). Add a doc block to the harness explaining why it has its own small event loop: it checks a component independently of the real engine, so an engine bug can't hide a component bug. Leave the public `checkComponentContract` API where it is.
- [ ] **R2.7 Split the metrics collector** (404 lines). Move `ComponentTally`, `WorkflowTally`, and `Tally` to `metrics/tallies.ts`. `simulateWithMetrics` stays the factory that builds the collector.
- [ ] **R2.8 AWS behaviors receive their primitives.** Each `definition.build()` constructs the `RateLimit`/`ServiceTime`/`ConcurrencyLimit` instances and passes them to the behavior's constructor, so behaviors no longer create them. The contract suite and template scenarios must stay green.
- [ ] **R2.9 Name events by their subject.** Proposed mapping (confirm with the user before starting):
  - Public `SimulationEvent` kinds and types get a subject prefix:
    - `workflow-started`/`workflow-finished` stay as they are.
    - `arrived`/`queued`/`started`/`rejected`/`finished`/`dispatched`/`async-finished` become `component-arrived`, `component-queued`, and so on, with types `ComponentArrivedEvent` and so on.
    - `attempt-failed` becomes `edge-attempt-failed`.
    - `tick` becomes `metrics-tick`.
  - The engine's internal `EngineEvent` becomes `ScheduledWork`, so `*Event` only ever means something reported to an observer. Its kinds:
    - `user-arrives` → `user-due`
    - `attempt-arrives` → `attempt-reaches-target`
    - `service-done` → `visit-service-done`
    - `response` → `attempt-answered`
    - `timeout` → `attempt-timed-out`
    - `retry` → `call-retry-due`
    - `nothing-to-deliver` → `visit-nothing-to-deliver`
  - The contract harness's `HarnessEvent` becomes `HarnessScheduledWork`, under the same convention.
  - Update the guides, the ADRs (by dated addendum only, for ADR-0006 and ADR-0007), and any snapshot text that changes.
- [ ] **R2.10 Split the trace tests** (`traces.test.ts`, 761 lines). One test file per subsystem in `src/domain/traces/`, with the shared formatters in `traces/format.ts`. The `.txt` outputs stay byte-identical. Update the guides' "refresh with" commands.
- [ ] **R2.11 Glossary.** Add `docs/glossary.md`: every domain term in one or two lines (Project, Architecture, Component, Edge, Workflow, Step, Workload, Request, Call, Attempt, Visit, Effect, Behavior, Definition, Registry, Tick, Snapshot, Record, Document). Include one diagram of how the runtime nouns nest (a request makes calls, a call makes attempts, an attempt becomes a visit at a component, a visit returns effects). Link it from the docs hub, the root README, and the top of the engine guide.
- [ ] **R2.12 C4 diagrams.** First check that Mermaid's `C4Context`/`C4Container`/`C4Component` render legibly on GitHub and in the VS Code preview. If they don't, draw `flowchart`s that follow C4's conventions (each box labeled with its kind, plus a legend). Add one diagram per level, no more:
  - Level 1 (context) and level 2 (containers): browser app, IndexedDB, Worker (planned), CLI. These go in the architecture overview.
  - Level 3 (components): one per guide (engine, component definitions, metrics, application layer).
  - Level 4 (code): a Mermaid `classDiagram` for each split from R2.5–R2.7, showing the class, its collaborators, and the factory that wires them.
  Add a line to CONTRIBUTING §Documentation saying which level goes where.
- [ ] **R2.13 Task-oriented docs hub.** Write for a reader who doesn't yet know what anything does or where it lives.
  - Add a short "Start here" page: what Wind Tunnel does, the level 1–2 diagram, a map of `src/`, and a link to the glossary.
  - Restructure the hub around "I want to…" routes, for example: add a component type, change engine behavior, add a metric, work on the UI, change the document format. Each route names the two or three docs to read, in order.
  - Keep the full document list as a reference index below the routes.
  - Audit for stale or duplicated text and cut it rather than adding more. Known stale spots: the root README's "engine and UI not built yet", and the architecture overview's "Planned: how a simulation run works".
- [ ] **R2.14 Move the gotchas.** Move the progress log's "Gotchas (still apply)" into a CONTRIBUTING "Gotchas" section, and delete it from this file.

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

### Gotchas (still apply)

- Vitest doesn't type-check: run `npx tsc -b` (or `npm run check`) before trusting a green test run.
- `erasableSyntaxOnly` is on: no constructor parameter properties; declare fields explicitly.
- Latencies carry float drift (49.000000000000014): assert with `toBeCloseTo`. Percentiles are bucket upper bounds, up to 5% high.
- Components talk to the engine through effects (ADR-0006); there's no timer effect yet, and no cancellation (a timed-out callee still finishes).
- TypeScript is pinned to `~6.0` because typescript-eslint doesn't support TS 7 yet. Layer rules use typescript-eslint's `no-restricted-imports`.
- The project was renamed from Cloud Builder; ADRs 0002, 0003, and 0005 were edited in place for the rename with the user's approval, a one-off exception to ADR immutability.
