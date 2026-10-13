# Implementation Plan

Tracks milestone progress for the MVP described in [`design/mvp-design.md`](design/mvp-design.md). Work happens one milestone at a time, and each new milestone usually starts in a fresh session, so this file is the source of truth for **where we are and what's next**.

## How to resume work (read this first)

1. Read `CLAUDE.md`, then this file.
2. Find the current milestone (the first one not marked ✅) and the first unchecked task in it.
3. Read the [Progress log](#progress-log) for decisions and gotchas from earlier sessions.
4. Read only the docs the current task needs; don't re-derive settled decisions (see `docs/adr/`).

## How to finish a milestone

1. All tasks checked, and the milestone's "done when" criteria verified.
2. Docs updated: the architecture overview, the design doc if reality differs from it, and new ADRs for significant decisions.
3. A short entry added to the [Progress log](#progress-log): what was built, what differs from the plan, and anything the next session needs to know.
4. **Compact this file:**
   - Replace the finished milestone's task list with a one-line summary and its commit range.
   - Trim older progress log entries to what a future session still needs. Anything already recorded in ADRs, design docs, or git history can go.
5. Refine the next milestone's tasks if what we learned changes them.
6. Commit, with the user's approval. The session can then be cleared.

## What belongs in this file

Only milestones, tasks, their status, and short log entries that future sessions need. Scratch notes, debugging details, and explanations belong in the conversation, in commit messages, or in the relevant doc, not here. Keep it short enough to read in a minute.

---

## M0: Project scaffolding

**Done when:** `npm run check` (typecheck, lint, test, build) passes locally and in CI, and a deliberately wrong import (e.g. `domain` → `adapters`) fails lint.

- [ ] Scaffold Vite + React + TypeScript; pin the Node version (`.nvmrc` and `engines`)
- [ ] Strict `tsconfig` (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`)
- [ ] Create the layer folders (`src/domain`, `src/application`, `src/adapters`, `src/ui`) and the composition root `src/main.tsx`
- [ ] Vitest with one sample test per layer
- [ ] ESLint (flat config) with typescript-eslint
- [ ] Import-boundary rule per ADR-0002, with Zod allowed in `domain` per ADR-0005
- [ ] Ban `Math.random`, `Date.now`, and `new Date()` in `domain` and `application`
- [ ] Prettier
- [ ] `npm run check` script combining typecheck, lint, test, and build
- [ ] GitHub Actions CI running `npm run check`
- [ ] `README.md`: what the project is, its status, how to run it, and links to the docs
- [ ] Add an MIT `LICENSE` (chosen 2026-10-13)
- [ ] Update the architecture overview with the actual tooling

## M1: Domain model and engine, headless

**Done when:** `npm run simulate -- --template a` and `--template b` print text reports; Template A shows connection exhaustion during the spike and Template B doesn't (asserted by scenario tests).

- [ ] `RandomSource` interface and seeded generator in `src/domain/random/`; distributions (constant, exponential, lognormal)
- [ ] Event queue (binary heap, ties broken by sequence number)
- [ ] Behavior primitives with unit tests: `ConcurrencyLimit`, `RateLimit`, `Queue`, `ServiceTime`
- [ ] Domain entities and validation: unique IDs, references point at real components, steps follow edges
- [ ] Component definition interface, registry, and shared contract test suite
- [ ] Component definitions: API Gateway, Lambda (with cold starts), DynamoDB, RDS (connections + query workers), SQS (with consumer max concurrency)
- [ ] Engine: event loop, request lifecycle, nested calls, edge latency, timeouts, retries, async `enqueue` work
- [ ] Metrics: per-component and per-workflow counters, fixed-bucket latency histograms, per-second snapshots
- [ ] Project document Zod schema (v1) and mapper to domain entities
- [ ] Template JSON files A and B
- [ ] Headless runner script with a text report
- [ ] Scenario tests for both templates
- [ ] Tuning pass: adjust defaults until the templates clearly teach their lesson; record final numbers in the design doc

## M2: Application layer and persistence

**Done when:** all MVP use cases pass tests against the IndexedDB adapter (`fake-indexeddb`) and the template catalog.

Tasks will be refined at the end of M1.

- [ ] Ports: `ProjectRepository`, `TemplateCatalog`, `Clock`, `IdGenerator`, `SimulationRunner`
- [ ] IndexedDB adapter (`idb`), database version 1, `projects` store with an `updatedAt` index
- [ ] Document migration scaffolding (`schemaVersion`)
- [ ] Template catalog adapter
- [ ] Use cases: `ListProjects`, `CreateProjectFromTemplate`, `LoadProject`, `SaveProject`, `DeleteProject`, `RunSimulation`
- [ ] In-process `SimulationRunner` (Worker version comes in M3)
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

### 2026-10-13: Planning complete

- Concept, ADRs 0001–0005, architecture overview, and MVP design written and committed.
- Next: M0.
