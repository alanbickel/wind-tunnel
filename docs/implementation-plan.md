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

## M2: Application layer and persistence

**Done when:** all MVP use cases pass tests against the IndexedDB adapter (`fake-indexeddb`) and the template catalog.

- [ ] Ports: `ProjectRepository`, `TemplateCatalog`, `Clock`, `IdGenerator`, `SimulationRunner`. Replace `src/application/layer.test.ts` with real tests
- [ ] Document mapper, domain → document: keep document-only fields (`layout`, timestamps, `source`) when saving; round-trips through `loadProject` unchanged
- [ ] Document migration scaffolding (`schemaVersion`), run by `loadProject` before the v1 schema
- [ ] Template catalog adapter over `src/adapters/templates/*.json`; the CLI's `TEMPLATES` map should use it
- [ ] IndexedDB adapter (`idb`), database `wind-tunnel` version 1, `projects` store with an `updatedAt` index
- [ ] Use cases: `ListProjects`, `CreateProjectFromTemplate` (new ID and timestamps from the ports), `LoadProject`, `SaveProject`, `DeleteProject`, `RunSimulation`
- [ ] In-process `SimulationRunner` over `simulateWithMetrics`, with snapshots streamed through `onSnapshot` (the Worker version comes in M3). Move the CLI's seed-override logic into `RunSimulation` so both share it
- [ ] Request persistent storage (`navigator.storage.persist()`)

## M3: Minimal UI

**Done when:** in the browser, a user can create a project from a template, view its architecture, run its workload, and see charts.

Tasks will be refined at the end of M2.

- [ ] ADRs: canvas library and chart library
- [ ] App shell and dependency injection via React context
- [ ] Project list and "new from template"
- [ ] Read-only architecture view
- [ ] Web Worker `SimulationRunner` adapter
- [ ] Run controls and metric charts

---

## Progress log

Newest first. Record what was built, what differs from the plan, and what the next session needs to know.

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
- `tests/architecture/layer-rules.test.ts` has timed out once in a full parallel run and passed on rerun; watch for flakiness.
- Components talk to the engine through effects (ADR-0006); there's no timer effect yet, and no cancellation (a timed-out callee still finishes).
- TypeScript is pinned to `~6.0` because typescript-eslint doesn't support TS 7 yet. Layer rules use typescript-eslint's `no-restricted-imports`.
- The project was renamed from Cloud Builder; ADRs 0002, 0003, and 0005 were edited in place for the rename with the user's approval, a one-off exception to ADR immutability.
