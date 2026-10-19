# Implementation Plan

Tracks milestone progress for the MVP described in [`design/mvp-design.md`](design/mvp-design.md). Work happens one milestone at a time, and each new milestone usually starts in a fresh session, so this file is the source of truth for **where we are and what's next**.

## How to resume work (read this first)

1. Read `CLAUDE.md`, then this file.
2. Find the current milestone (the first one not marked ✅) and the first unchecked task in it, then read its GitHub issue.
3. Read the [Progress log](#progress-log) for decisions from earlier sessions, and CONTRIBUTING's [Gotchas](../CONTRIBUTING.md#gotchas).
4. Read only the docs the current task needs; don't re-derive settled decisions (see `docs/adr/`).

## How to finish a milestone

1. All tasks checked, and the milestone's "done when" criteria verified.
2. Docs updated: the architecture overview, the design doc if reality differs from it, new ADRs for significant decisions, a short onboarding guide for each new subsystem, and every new document listed in its folder's overview or the [root README](../README.md#documentation).
3. A short entry added to the [Progress log](#progress-log): what was built, what differs from the plan, and anything the next session needs to know.
4. **Compact this file:**
   - Replace the finished milestone's task list with a one-line summary and its PR numbers.
   - Trim older progress log entries to what a future session still needs. Anything already recorded in ADRs, design docs, or git history can go.
5. Refine the next milestone's tasks if what we learned changes them.
6. Push the milestone's last branch and open its PR ([CONTRIBUTING](../CONTRIBUTING.md#branches-and-pull-requests)). The session can then be cleared.

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

## R2: Maintainability ✅

Made the code and docs easier to navigate before the UI: a `max-lines` warning; rules 10 (collaborators come from factories, typed as interfaces, [ADR-0009](adr/0009-collaborators-come-from-factories.md)) and 11 (one class per file, named after it); the parameter-object naming convention in rule 8 and the renames to match; the engine, contract checker, metrics collector, and trace tests split; AWS behaviors given their primitives; events named by their subject; a glossary, C4 diagrams, the root README as the map of every document, and the gotchas moved into CONTRIBUTING. No snapshot changed, and the million-event test is within noise of before. Commits `590926e`..`4b3631d`, plus the commit that closes R2.

## M3: Minimal UI

**Done when:** in the browser, a user can create a project from a template, view its architecture, run its workload, and see charts.

Each task is a GitHub issue in the [M3 milestone](https://github.com/alanbickel/wind-tunnel/milestone/1); the issue holds its scope and dependencies.

- [x] ADRs: canvas library and chart library (React Flow, ADR-0010; Recharts, ADR-0011; each behind our own components, enforced by ESLint)
- [x] Browser `Clock` (`new Date().toISOString()`) and `IdGenerator` (`crypto.randomUUID()`) adapters
- [x] [#3](https://github.com/alanbickel/wind-tunnel/issues/3) Composition root and an app shell that provides the use cases
- [x] [#4](https://github.com/alanbickel/wind-tunnel/issues/4) Project list and new-from-template
- [x] [#5](https://github.com/alanbickel/wind-tunnel/issues/5) Read-only architecture view
- [x] [#6](https://github.com/alanbickel/wind-tunnel/issues/6) Web Worker `SimulationRunner` with cancellation
- [x] [#7](https://github.com/alanbickel/wind-tunnel/issues/7) Run controls and metric charts
- [ ] [#8](https://github.com/alanbickel/wind-tunnel/issues/8) Request persistent storage after the first project is created
- [ ] [#9](https://github.com/alanbickel/wind-tunnel/issues/9) UI onboarding guide and its component diagram

---

## Progress log

Newest first. Record what was built, what differs from the plan, and what the next session needs to know.

### 2026-10-16: R2 complete

- **New code follows rules 8, 10, and 11** from the start: `<Name>Input`/`<Class>Dependencies`/`<Name>Context` parameter objects, collaborators built by a factory or composition root (`main.tsx` is one) and typed as interfaces named for the role, and one class per file. `tests/architecture/` has no exceptions left, so a misnamed class file or a class-typed `*Dependencies` property fails the build.
- **Docs:** the root README is the map; a new document goes in its folder's overview (or the README if the folder has none), and a new guide gets a level 3 diagram styled like the overview's legend (CONTRIBUTING §Documentation). Terms go in the [glossary](glossary.md).
- **Differs from the plan:** R2.15 also split `fake-ports.test.ts` and `random-source.test.ts` to follow their classes, and replaced `class-files.test.ts`'s exception list with a plain "nothing misnamed" check.
- **Measuring speed:** whole-template timings swing ±30% between runs. Compare the million-event test instead, alternating runs of the old and new code (a `git worktree` with `node_modules` linked as a junction; remove the junction before the worktree): `npx vitest run src/domain/engine/simulation.test.ts -t "loops without advancing" --reporter verbose`. It ran 1.1–1.7 s at R2's close.
- **Scripted edits:** Python isn't installed, and Git Bash strips backslashes inside heredocs, which breaks regexes. Write such scripts to a file first.

### 2026-10-15: M2 complete

- **Read [the application layer guide](architecture/application-layer.md)** before M3: the ports, which adapters fill them, records vs. documents, and a project traced end to end ([`src/adapters/traces/`](../src/adapters/traces/), refresh with `npx vitest run -u src/adapters/traces`).
- **Differs from the plan:** `LoadProject` became `OpenProject`, and `ListTemplates` is new (MVP design §5.2). `RunSimulation` takes a `Project`, not an ID. Nothing calls `StoragePersistence` yet; M3 calls it after the first project is created, because Firefox prompts.
- **Still missing for the browser:** `Clock` and `IdGenerator` adapters, the Worker runner, and the composition root (all in M3). The `blocked`/`blocking` case when a newer build upgrades the database while another tab holds it is still in the local TODO.md (not yet an issue); it matters once there's a database version 2.
- **Shapes to follow:** one class per use case, ports in the constructor as one object, work in `execute`, results as `status` unions. A new port gets a fake in `src/application/testing/`. Adapters reading stored or imported JSON go through `loadProject`.
- **Tests:** IndexedDB tests `import "fake-indexeddb/auto"`, then `vi.stubGlobal("indexedDB", new IDBFactory())` in `beforeEach` and close the database in `afterEach`. Each test body stays within 30 lines; split a long scenario into named steps.

### Earlier milestones

- **Helpers (R1):** `src/domain/shared/kind-handlers.ts` has `KindHandlers`/`handleKind` for discriminated unions and `lookup` for `Record` tables. Tests can use `workflowIn`/`componentIn` (`src/domain/metrics/testing/`) instead of chains of `?.`.
- **Templates (M1):** `template-scenarios.test.ts` asserts each template's lesson by phase on seeds 42, 7, and 2026; a template change that alters its lesson must update it.
