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

## M1: Domain model and engine, headless

**Done when:** `npm run simulate -- --template a` and `--template b` print text reports; Template A shows connection exhaustion during the spike and Template B doesn't (asserted by scenario tests).

- [x] `RandomSource` interface and seeded generator in `src/domain/random/`; distributions (constant, exponential, lognormal)
- [x] Event queue (binary heap, ties broken by sequence number)
- [x] Behavior primitives with unit tests: `ConcurrencyLimit`, `RateLimit`, `Queue`, `ServiceTime`
- [x] Domain entities and validation: unique IDs, references point at real components, steps follow edges
- [x] Component definition interface, registry, and shared contract test suite
- [x] Component definitions: API Gateway, Lambda (with cold starts), DynamoDB, RDS (connections + query workers), SQS (with consumer max concurrency)
- [ ] Engine: event loop, request lifecycle, nested calls, edge latency, timeouts, retries, async `enqueue` work. Decide how to stop SQS's immediate redelivery from looping at one instant (nonzero edge latency, or a `wake-at` effect for a visibility timeout)
- [ ] Metrics: per-component and per-workflow counters, fixed-bucket latency histograms, per-second snapshots. Expose type-specific gauges: RDS connections held, Lambda cold starts
- [ ] Project document Zod schema (v1) and mapper to domain entities
- [ ] Template JSON files A and B. Set DynamoDB's `burstSec` deliberately: the default (300) starts the bucket full and hides throttling in a 60 s run
- [ ] Headless runner script with a text report
- [ ] Scenario tests for both templates
- [ ] Tuning pass: adjust defaults until the templates clearly teach their lesson; record final numbers in the design doc

## M2: Application layer and persistence

**Done when:** all MVP use cases pass tests against the IndexedDB adapter (`fake-indexeddb`) and the template catalog.

Tasks will be refined at the end of M1.

- [ ] Ports: `ProjectRepository`, `TemplateCatalog`, `Clock`, `IdGenerator`, `SimulationRunner`
- [ ] IndexedDB adapter (`idb`), database version 1, `projects` store with an `updatedAt` index
- [ ] Document mapper keeps document-only fields (`layout`, timestamps, `source`) when saving; the domain entities don't carry them
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

### 2026-10-14: M1 task 6 (AWS component definitions)

- The five types live in `src/domain/components/aws/`; `createAwsComponentRegistry()` builds the registry the engine, runner, and templates should use.
- SQS redelivers a failed message immediately (no visibility timeout). For the engine: if a consumer fails instantly (e.g. throttled) over a zero-latency edge, this can loop many times at one simulated instant. Keep queue → consumer edges at nonzero latency, or add a `wake-at` effect.
- DynamoDB's default `burstSec: 300` starts the bucket full, so Template B's table won't throttle during a 60 s run unless the template sets `burstSec` lower.
- Type-specific gauges (RDS connections held, Lambda cold starts) aren't exposed yet; the metrics task will need them.

### 2026-10-13: M1 in progress (tasks 1–5)

- Components talk to the engine through effects (ADR-0006). No cancellation: timed-out callers stop waiting, but the callee finishes normally.
- Each definition's test asserts `checkComponentContract(def).violations` is empty. `testing/fake-definitions.ts` holds two reference implementations (worker pool, message queue).
- Lambda cold starts must be lazy (check idle time on `arrive`); there's no timer effect yet.
- Vitest doesn't type-check: run `npx tsc -b` (or `npm run check`) before trusting a green test run.

- `erasableSyntaxOnly` is on: no constructor parameter properties (`constructor(private x)`); declare fields explicitly.
- Floating-point drift matters in time-based primitives: `RateLimit` compares tokens with a 1e-9 tolerance; a long-run rate test guards it.
- Worked examples for guides live in `src/domain/traces/` as file snapshots (`toMatchFileSnapshot`); add a trace when adding a guide.
- Validation is split: Zod document schema checks shape and ranges; `validateProject` checks cross-entity rules; type-specific rules (e.g. which actions a component accepts) belong to component definitions.

### 2026-10-13: Renamed to Wind Tunnel

- The project was renamed from Cloud Builder to Wind Tunnel (repo `alanbickel/wind-tunnel`, package `wind-tunnel`). The local folder and the local-only `cloud-builder-concept.md` keep the old name.
- ADRs 0002, 0003, and 0005 were edited in place for the rename, with the user's approval; this is a one-off exception to ADR immutability.
- The IndexedDB database name in the MVP design is now `wind-tunnel`.

### 2026-10-13: M0 scaffolding

- Built as planned and green in CI (about 20s per run); tooling and enforcement are documented in the architecture overview ("How the rules are enforced").
- Differences from the plan: layer rules use typescript-eslint's `no-restricted-imports` rather than `eslint-plugin-boundaries`, whose dependencies had critical audit findings. `tsconfig.core.json` checks `domain`/`application` without DOM or Node types. Prettier skips Markdown.
- Versions: ESLint 10, Vite 8, Vitest 5, Zod 4. TypeScript is pinned to `~6.0` because typescript-eslint doesn't support TS 7 yet.
- For M1: the headless runner needs a way to run TS in Node with extensionless imports (Node's built-in type stripping can't resolve them). Consider `vite-node` or running it through Vitest rather than adding `tsx`.
- Layer placeholder tests (`src/*/layer.test.ts`) should be deleted once each layer has real tests.
