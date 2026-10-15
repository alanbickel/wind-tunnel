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

## R1: Coding-standards refactor (interlude, before the rest of M2)

**Done when:** `npm run lint` reports no warnings, the coding-standard rules are errors, and the trace and report snapshots are unchanged except for intended renames. Every phase is `refactor` commits only; no behavior changes.

- [x] 1. Foundations: a shared exhaustive handler-map type in `domain/`; name the anonymous union members (`SimulationEvent`, `Effect`, `EngineEvent`, `HarnessEvent`, `ProjectLookup`, `LoadResult`, and the inline types); a string comparator in place of the nested ternaries; remove duplicates (`summaryOf`/`toSummary`, `Path`, Zod issue mapping)
- [x] 2. `backoffMs` and `sample` as lookup maps with input objects; `LatencySummary` fields become `p50Ms`, `p95Ms`, `p99Ms`, `maxMs` (snapshots and guides too)
- [x] 3. Engine: split the constructor; `handle` and `apply` become handler maps; `call()` takes an input object
- [x] 4. `ComponentBehavior` methods take one input object; each `build()` becomes a named class. Before/after timings from `npm run simulate`; a dated addendum to ADR-0006 for the signature
- [x] 5. `MetricsCollector.observe` as an event-handler map
- [x] 6. Contract checker: `runScenario` becomes a `ContractHarness` class
- [ ] 7. Validation: context objects; split `checkWorkload` and `validateComponents`
- [ ] 8. Adapters: `parseArgs` as a flag table; `formatReport` input object; report columns as data; `loadProject`/`toProject` in stages
- [ ] 9. Application testing kit and test files
- [ ] 10. Coding-standard rules from `warn` to `error`; update CONTRIBUTING ("Enforcement", "Existing code") and the README to match

Decisions: rule 7 applies to component methods (no exception). Fields in seconds (`durationSec`, `atSec`, `idleTimeoutSec`, `burstSec`) stay as they are; the M2 document mapper converts to milliseconds for the domain.

## M2: Application layer and persistence

**Done when:** all MVP use cases pass tests against the IndexedDB adapter (`fake-indexeddb`) and the template catalog.

- [x] Ports: `ProjectRepository`, `TemplateCatalog`, `Clock`, `IdGenerator`, `SimulationRunner`. Replace `src/application/layer.test.ts` with real tests
- [ ] Document mapper, `ProjectRecord` ↔ document (ADR-0008): round-trips `sampleRecord` and both templates through `loadProject` unchanged
- [ ] Document migration scaffolding (`schemaVersion`), run by `loadProject` before the v1 schema
- [ ] Template catalog adapter over `src/adapters/templates/*.json`; the CLI's `TEMPLATES` map should use it
- [ ] IndexedDB adapter (`idb`), database `wind-tunnel` version 1, `projects` store with an `updatedAt` index
- [ ] Use cases: `ListProjects`, `CreateProjectFromTemplate` (new ID and timestamps from the ports), `LoadProject`, `SaveProject`, `DeleteProject`, `RunSimulation`
- [ ] In-process `SimulationRunner` over `simulateWithMetrics`, with snapshots streamed through `onSnapshot` (the Worker version comes in M3). Move the CLI's seed-override logic into `RunSimulation` so both share it
- [ ] Request persistent storage (`navigator.storage.persist()`)
- [ ] Onboarding guide for the application layer and persistence: ports, records vs. documents, a use case traced end to end

## M3: Minimal UI

**Done when:** in the browser, a user can create a project from a template, view its architecture, run its workload, and see charts.

Tasks will be refined at the end of M2.

- [ ] ADRs: canvas library and chart library
- [ ] App shell and dependency injection via React context
- [ ] Project list and "new from template"
- [ ] Read-only architecture view
- [ ] Web Worker `SimulationRunner` adapter. Add cancellation to the port (stop a run, terminate the Worker); M2's port has none because `AbortSignal` isn't in the ECMAScript-only lib `application/` is checked with
- [ ] Run controls and metric charts

---

## Progress log

Newest first. Record what was built, what differs from the plan, and what the next session needs to know.

### 2026-10-15: R1 phases 1 to 6

- **Helpers** in `src/domain/shared/kind-handlers.ts`: `KindHandlers`/`handleKind` for discriminated unions, and `lookup` for `Record` tables. Both throw on a key the table doesn't own (so `"toString"` can't find an inherited method). Use them for the remaining `switch` statements.
- **Proof of no behavior change:** the trace snapshots (`src/domain/traces/`) and report snapshots (`src/adapters/cli/reports/`) must stay byte-for-byte unchanged.
- **Measuring speed:** whole-template timings on this machine swing ±30% between runs. Compare the million-event test instead, alternating with `git stash`: `npx vitest run src/domain/engine/simulation.test.ts -t "loops without advancing" --reporter verbose`. Phases 1 to 4 showed no measurable cost.
- **Scripted edits:** Git Bash strips backslashes inside heredocs, which breaks regexes. Write such scripts to a file first.

### 2026-10-15: M2 started (ports)

- **Ports** (`62e12f2`): the repository and catalog exchange `ProjectRecord`s (domain `Project` + `createdAt`, `updatedAt`, `source`, `layout`), never documents (ADR-0008). `Clock.now()` returns an ISO string in `toISOString` format, because ESLint bans `new Date` anywhere in `application/`, tests included. `ProjectRepository.get` returns `found`, `missing`, or `invalid` with a user-facing `reason` plus `issues`.
- **Testing kit** in `src/application/testing/`: `InMemoryProjectRepository`, `FixedClock`, `SequentialIds`, `sampleRecord` (valid against the AWS registry, every optional field set), and `checkProjectRepositoryContract`, which returns a list of violations. The IndexedDB adapter's test must run it with `sampleRecord` and expect `[]`.
- **Next:** the document mapper. Template JSON timestamps (`2026-10-14T00:00:00Z`) aren't in the `Clock` format; that's fine, because new projects take fresh timestamps from the clock. The CLI uses template keys `a`/`b`, while document IDs are `template-a`/`template-b`; settle which one the catalog uses in the catalog task.

### 2026-10-15: M1 complete

- **Tuning:** only one setting changed. Template B's `orders-queue` consumer limit went from 40 to 15, so the backlog grows during the spike (peak about 1,900) and drains by 54 s, and writes land up to about 6 s late. Template A needed no change (44% of requests fail, all `too-many-connections`). Final numbers and the settings tried are in MVP design §7.
- **Scenario tests:** `src/adapters/templates/template-scenarios.test.ts` asserts each lesson by phase on seeds 42, 7, and 2026, with loose thresholds. A template change that alters its lesson must update these tests. Refresh the report snapshots with `npx vitest run -u src/adapters/cli`.
- **Report:** every total in the text report reconciles (`report-reconciles.test.ts`); keep it that way when adding columns.
- **Headless runner:** `scripts/simulate.js` loads TypeScript with Vite's experimental `runnerImport` (about 2 s startup), not `tsx`.
- **Loading:** `loadProject(json, registry)` runs the v1 schema, `validateProject`, then `validateComponents`, and returns the `Project` plus the parsed document. Schema objects are strict; seeds are 0 to 2^32 − 1.
- **Known model gaps** (in TODO.md and `docs/design/fidelity.md`): SQS has no visibility timeout (failed messages are redelivered at once; the engine throws after 1,000,000 events at one instant). Lambda cold starts are checked lazily on arrival. Template A understates AWS (LMB-8, RDS-2, RDS-4).

### Gotchas (still apply)

- Vitest doesn't type-check: run `npx tsc -b` (or `npm run check`) before trusting a green test run.
- `erasableSyntaxOnly` is on: no constructor parameter properties; declare fields explicitly.
- Latencies carry float drift (49.000000000000014): assert with `toBeCloseTo`. Percentiles are bucket upper bounds, up to 5% high.
- Components talk to the engine through effects (ADR-0006); there's no timer effect yet, and no cancellation (a timed-out callee still finishes).
- TypeScript is pinned to `~6.0` because typescript-eslint doesn't support TS 7 yet. Layer rules use typescript-eslint's `no-restricted-imports`.
- The project was renamed from Cloud Builder; ADRs 0002, 0003, and 0005 were edited in place for the rename with the user's approval, a one-off exception to ADR immutability.
