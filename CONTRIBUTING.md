# Contributing

This guide covers how to set up, the rules the code follows, and how to test, document, and merge a change. If you're new to the codebase, start with [Getting started](docs/getting-started.md); its reading order takes about an hour.

## Setup

Node 24 (see [`.nvmrc`](.nvmrc)).

```sh
npm install
npm run dev     # dev server
npm run check   # typecheck, lint, format check, tests, build: what CI runs
```

The [README](README.md#running-it) lists every script. A few things worth knowing up front:

- **Vitest doesn't type-check.** A green test run can hide a type error. Run `npm run check` (or at least `npx tsc -b`) before you trust it.
- Prettier owns formatting, and CI checks it. Run `npm run format` rather than formatting by hand.
- `npm run simulate -- --template template-a` runs a template headlessly and prints a text report. Use it to see what a model change does before and after ([guide](docs/architecture/headless-runner.md)).
- Work is planned in milestones. [`docs/implementation-plan.md`](docs/implementation-plan.md) says what's in progress and what's next.

## Architecture rules

The code follows Clean Architecture ([ADR-0002](docs/adr/0002-use-clean-architecture-layering.md)); the [architecture overview](docs/architecture/architecture-overview.md) explains where code goes. ESLint enforces the first two rules below, so a violation fails CI.

- **Imports point inward only:** `ui`/`adapters` → `application` → `domain`. `ui/` gets adapters through dependency injection and may import only types from `domain/`.
- **`domain/` and `application/` are deterministic.** No `Math.random`, `Date.now`, or `new Date`; no React, DOM, Worker, or Node APIs. Randomness comes from a seeded `RandomSource` and time from the `Clock` port, so the same seed always gives the same run. Libraries are allowed there only when an ADR approves them ([ADR-0005](docs/adr/0005-use-zod-for-schema-validation.md)).
- **Register, don't edit the engine (Open/Closed).** A new component type is a new `ComponentDefinition` added to the registry. It returns effects to the engine and never schedules events itself ([ADR-0006](docs/adr/0006-components-return-effects-to-the-engine.md)). See [Adding a component type](#adding-a-component-type).
- **Significant decisions get an ADR** in `docs/adr/` (copy [the template](docs/adr/template.md)). An accepted ADR's body and decision are never edited. A later change that affects it, without changing the decision, gets a dated addendum at the end; a changed decision gets a new ADR that supersedes the old one ([ADR-0001](docs/adr/0001-record-architecture-decisions.md)).

## Coding standards

These heuristics encourage healthy habits and steer away from shapes that invite defects. Be kind to your fellow maintainers: if you wouldn't want to maintain it, don't commit it.

ESLint and the architecture tests check rules 2, 5, 6, 7, 10, and 11 (see [Enforcement](#enforcement)), and a violation fails `npm run check` and CI. Reviewers check the rest.

**Exceptions** are allowed but must be justified in writing. If the reason isn't worth writing, the exception isn't worth making. Put the reason after `--` in the disable comment:

```ts
// eslint-disable-next-line max-params -- mirrors ComponentBehavior.arrive, which the engine calls per request
```

**Scope:** code we own. Code and signatures we don't control follow their owners: callbacks for the platform (DOM events, `Array.prototype` methods, React, Vitest) take the parameters the platform passes, and generated or vendored code keeps its upstream form.

**Refactor first.** When a change would push a function over a limit, or the function already breaks a rule ESLint can't check, reshape it first in its own `refactor` PR, then make your change. Reviewers can then check that the refactor changed no behavior. Don't fix unrelated code in passing.

### 1. Single-responsibility functions

Orchestrators (use cases, commands, wiring, event dispatch) delegate. Calculations and transformations live in their own named functions.

```ts
// ✗ orchestration and arithmetic in one place
function summarize(snapshot: MetricsSnapshot): Summary {
  const total = snapshot.succeeded + snapshot.failed;
  const errorRate = total === 0 ? 0 : snapshot.failed / total;
  // …
  return { total, errorRate /* … */ };
}

// ✓ the orchestrator reads like a list of steps; each calculation has a name
function summarize(snapshot: MetricsSnapshot): Summary {
  return { total: totalCalls(snapshot), errorRate: errorRate(snapshot) /* … */ };
}

function errorRate(snapshot: MetricsSnapshot): number {
  const total = totalCalls(snapshot);
  return total === 0 ? 0 : snapshot.failed / total;
}
```

### 2. Rule of 30

At most 30 lines of logic per function (blank lines and comments don't count). Over that, split it or write down why not.

ESLint counts a nested function's lines toward the function around it. A `build()` that returns an object literal full of methods, as the component definitions do, adds up fast. Move the methods into a named class or into functions of their own.

### 3. Return early (guard clause)

Handle defaults, invalid input, and base cases first, then do the main work unindented.

```ts
// ✗
private continueVisit(visit: Visit): void {
  const child = visit.attempt.call.step.calls?.[visit.nextCall];
  if (child !== undefined) {
    // … make the next call
  } else {
    this.completeVisit(visit, undefined);
  }
}

// ✓
private continueVisit(visit: Visit): void {
  const child = visit.attempt.call.step.calls?.[visit.nextCall];
  if (child === undefined) {
    this.completeVisit(visit, undefined);
    return;
  }
  // … make the next call
}
```

### 4. Look up, don't branch

Choosing between behaviors is a job for a map, not `if/else` or `switch`. `if/else` is a yellow flag; a lone guard clause (rule 3) is fine.

Type the map so that every case must be handled. For a union of string literals, `Record<Union, Handler>` does it: add a member to the union and the map stops compiling until it has a handler.

```ts
// ✗
switch (policy.backoff) {
  case "none": return policy.baseDelayMs;
  case "exponential": return exponential;
  case "exponential-jitter": return random.next() * exponential;
}

// ✓ a new backoff kind without a rule is a compile error
type BackoffRule = (input: BackoffRuleInput) => number;

const BACKOFF_RULES: Record<RetryPolicy["backoff"], BackoffRule> = {
  none: ({ policy }) => policy.baseDelayMs,
  exponential: ({ exponential }) => exponential,
  "exponential-jitter": ({ exponential, random }) => random.next() * exponential,
};
```

For a discriminated union whose members carry different fields (such as `SimulationEvent` or `Effect`), map each `kind` to a handler for its own member:

```ts
type EventHandlers = {
  [K in SimulationEvent["kind"]]: (event: Extract<SimulationEvent, { kind: K }>) => void;
};
```

When a second place needs this, extract it into a shared helper in `domain/` rather than writing it again.

### 5. Keep control flow flat

Nested conditionals, `else if` chains, and nested ternaries are red flags. There is always a flatter way: return early, look it up, or extract a function.

### 6. Keep complexity low

Count the decision points: each `if`, `?:`, `&&`/`||`/`??`, loop, `case`, and `catch` counts as one. 5 or fewer is ideal. 6 to 8 is a yellow flag: write down why. 9 or more is a red flag, and ESLint fails.

### 7. At most two parameters

Three or more becomes one typed input object. Prefer an object even at two when the meaning isn't obvious from the call. Adding an input later then doesn't break existing call sites.

```ts
// ✗ which number is which?
backoffMs(policy, 3, random);

// ✓
backoffMs({ policy, failedAttempts: 3, random });
```

Callbacks that other layers implement, such as observers and `onSnapshot`, always take one object.

The engine calls component methods (`arrive`, `finish`) many times per run. If you think an input object costs too much there, measure it with `npm run simulate` before claiming the exception.

### 8. Name your types

No anonymous object types in parameters, return types, properties, generic arguments, or union members. Derived types (`Partial<T>`, `Pick<T, K>`, `Extract<T, U>`, `z.infer<typeof schema>`) are fine.

```ts
// ✗ each member is anonymous; easy to break one without noticing
type SimulationEvent =
  | { kind: "component-arrived"; timeMs: number; componentId: string }
  | { kind: "component-rejected"; timeMs: number; componentId: string; reason: string };

// ✓
interface ComponentArrivedEvent { kind: "component-arrived"; timeMs: number; componentId: string }
interface ComponentRejectedEvent { kind: "component-rejected"; timeMs: number; componentId: string; reason: string }
type SimulationEvent = ComponentArrivedEvent | ComponentRejectedEvent;
```

**Parameter objects** take one of three suffixes, so the type name says what kind of thing is being passed:

| Suffix | What it holds | Example |
|---|---|---|
| `<Name>Input` | The data a function, method, or constructor works on, in one object (rule 7). `Name` is the function, or the subject when a family of functions takes the same shape. | `RunSimulationInput`; `StepInput` for `checkStep`, `checkTarget`, and `checkAsync` |
| `<Class>Dependencies` | A constructor's collaborators (rule 10). | `RunSimulationDependencies` |
| `<Name>Context` | State shared across a family of functions, such as the lookup tables and issue list of a validation walk. It comes second, after the `Input`. | `checkStep(input: StepInput, context: StepContext)` |

Don't use `Options`, `Settings`, `Params`, `Args`, or `At`. A type holding an input with its defaults filled in is named for what it holds. Two names stay as they are: `BuildContext`, which is public component API, and the component `*Config` types, which are part of the project document rather than parameter objects.

### 9. Put the unit in the name

A simulator is full of numbers that mean time, rates, and counts. A name without a unit invites mixing milliseconds with seconds. Durations and timestamps end in `Ms` (`timeoutMs`, `nowMs`, `retryAtMs`); rates say what they count per what (`requestsPerSecond`). Keep the engine in milliseconds and convert only at the edges, such as a report or a chart axis.

```ts
// ✗ 30 what?
const timeout = 30;

// ✓
const timeoutMs = 30_000;
```

### 10. Collaborators come from factories

A class never creates the objects it delegates to. They come in through the constructor, typed as interfaces, and a factory function or composition root builds them ([ADR-0009](docs/adr/0009-collaborators-come-from-factories.md)). The constructor's signature then lists everything the class depends on, and a test can pass in a fake.

- **Dependencies** have behavior the class delegates to: `EventQueue`, `RateLimit`, `ServiceTime`, `ConcurrencyLimit`, `SeededRandom`, and the like. They arrive in one `<Class>Dependencies` object, and each property is an interface, not a class. A class with `private` fields only accepts its own instances, so a test can't hand in a fake; an interface accepts any object of the right shape.
- **Name the interface for the role; let the class name say how it works:** `ComponentRegistry` is implemented by `ComponentRegistryMap`, `RateLimit` by `TokenBucket`. No `I` prefix, and no abstract base classes.
- **State** may be created in place: `Map`, `Set`, arrays, plain records, and pure accumulators that only store data (`Queue`, `LatencyHistogram`, `Tally`). A new accumulator goes in `STATE_CLASSES` in `eslint.config.js`.
- **`new` belongs** in factories (`simulate`, `ComponentDefinition.build`, `createAwsComponentRegistry`) and composition roots (the CLI command, `main.tsx`, tests).

```ts
// ✗ the constructor hides what the behavior depends on, and a test can't swap it
class ApiGatewayBehavior<T> {
  constructor(config: ApiGatewayConfig) {
    this.limit = new TokenBucket({ ratePerSec: config.ratePerSec, burst: config.burst });
  }
}

// ✓ the behavior names the role it needs; build() is the factory that fills it
interface ApiGatewayBehaviorDependencies {
  readonly limit: RateLimit; // an interface; TokenBucket implements it
}

build<T>(config: ApiGatewayConfig): ComponentBehavior<T> {
  const limit = new TokenBucket({ ratePerSec: config.ratePerSec, burst: config.burst });
  return new ApiGatewayBehavior<T>({ limit });
}
```

### 11. One class per file, named after it

Each class gets its own file, named after the class in kebab case: `ComponentRegistryMap` lives in `component-registry-map.ts`, and `IndexedDbProjectRepository` in `indexed-db-project-repository.ts`. A reader who sees a class name knows which file to open.

Interfaces follow what they're for:

- **A role interface gets its own file**, named after the interface, even when it has one implementation: `ComponentRegistry` in `component-registry.ts`, the ports in `application/ports/`. The role often lives in an inner layer and its implementations in an outer one, so they can't share a file anyway.
- **A class's own shapes stay in the class's file:** its `Input`, `Dependencies`, and result types. They mean nothing apart from the class.

Shared test fakes in `testing/` folders follow the rule. A `*.test.ts` file is exempt: it may keep small test doubles used only by its own tests beside them.

### Enforcement

| Rule | ESLint rule | Level |
|---|---|---|
| 2. Rule of 30 | `max-lines-per-function` (30, skipping blanks and comments) | error; off in tests |
| 5. Flat control flow | `max-depth` (2), `no-nested-ternary`, `no-else-return`, `no-lonely-if` | error |
| 6. Complexity | `complexity` (8) | error |
| 7. Two parameters | `max-params` (2) | error; off in tests |
| 10. Collaborators from factories | `no-restricted-syntax` (`new` inside a class body, except built-ins, `STATE_CLASSES`, and `*Factory`/`*Builder`) | error; off in tests. Misses dependencies built by a helper function the class calls, so reviewers check those |
| 10. Dependencies are interfaces | Not ESLint: `tests/architecture/dependency-types.test.ts` fails if a `*Dependencies` property is typed as a class | test failure. Only sees types named `*Dependencies` |
| 11. One class per file | `max-classes-per-file` (1) | error; off in tests |
| 11. File named after its class | Not ESLint: `tests/architecture/class-files.test.ts` fails if a class's file isn't its name in kebab case | test failure; skips tests. Where a role interface lives is for reviewers |
| 1, 3, 4, 8, 9 | None; reviewers check | |
| File length | `max-lines` (400, skipping blanks and comments) | warning; tests included |

**File length** is only a warning: it means "consider splitting this file", not "must fix". A file past 400 lines usually holds more than one idea, and a newcomer has to read all of it to find the one they need. Split along those ideas when you can name them; when the file really is one idea, leave it and move on.

## Adding a component type

A new AWS service (or any other component type) touches these places, all in the same change:

1. A `ComponentDefinition` in `src/domain/components/`, registered in the registry. The engine doesn't change.
2. A test that runs `checkComponentContract` against it, plus tests for its own behavior.
3. For each place the model simplifies or guesses at AWS behavior, an entry in [`docs/design/fidelity.md`](docs/design/fidelity.md), with its ID cited in the code comment. Mark every claim about AWS as **Documented** (with a link you checked), **Observed**, or **Assumption**.
4. Anything surprising about the service at scale goes in [AWS: Did you know?](docs/learning/aws-did-you-know.md).
5. The [component definitions guide](docs/architecture/component-definitions.md), updated to list it.

## Tests

- Unit tests sit next to the code (`foo.ts` → `foo.test.ts`) and run in Node. Architecture tests live in `tests/architecture/`.
- The coding standards apply to tests too. ESLint skips the length and parameter checks there, because a `describe` block groups many tests; keep each test itself within the rule of 30.
- A regression test says which bug it guards against.
- Tests should be able to fail. When you write one, break the code it covers and watch it go red at least once.
- Use the seed, not luck. Anything random runs from a fixed seed. Scenario tests that assert a template's lesson check several seeds (`src/adapters/templates/template-scenarios.test.ts`) with loose thresholds, so they pin the lesson rather than one run's numbers.
- **Contract suites** check that an implementation keeps the promises of its interface. Every component type must pass `checkComponentContract`, and every `ProjectRepository` adapter must pass `checkProjectRepositoryContract` with an empty list of violations.
- **Outputs must reconcile.** Totals in metrics and reports add up: started = succeeded + failed + in progress, and so on. Show work that's still in progress rather than dropping it, and test the remainders (see `src/adapters/cli/report-reconciles.test.ts`). Add a check when you add a column or a counter.
- Latencies carry floating-point drift (`49.000000000000014`): compare them with `toBeCloseTo`. Percentiles are bucket upper bounds, up to 5% high ([metrics guide](docs/architecture/metrics.md)).
- Model changes come with before/after numbers from `npm run simulate`.

### Docs backed by tests

Some docs quote output that a test generates or checks. Change them together:

| Doc | Test |
|---|---|
| Excerpts in the [engine](docs/architecture/simulation-engine.md), [component](docs/architecture/component-definitions.md), [domain model](docs/architecture/domain-model.md), and [metrics](docs/architecture/metrics.md) guides | Snapshot traces in `src/domain/traces/`, one test file per guide; refresh with `npx vitest run -u src/domain/traces`, then update the excerpt in the guide |
| The sample reports in the [headless runner guide](docs/architecture/headless-runner.md) | Snapshots in `src/adapters/cli/reports/`; refresh with `npx vitest run -u src/adapters/cli` and read the diff |
| Each template's lesson in [MVP design §7](docs/design/mvp-design.md) | `src/adapters/templates/template-scenarios.test.ts` |

## Gotchas

- **No constructor parameter properties.** `erasableSyntaxOnly` is on, so `constructor(private readonly queue: EventQueue)` doesn't compile. Declare the field and assign it in the constructor.
- **TypeScript is pinned to `~6.0`** because typescript-eslint doesn't support TypeScript 7 yet. For the same reason, the layer rules use typescript-eslint's `no-restricted-imports`, not ESLint's.

## Documentation

Write for a maintainer who is new to the codebase: say what something does and why, not only how. Too many docs, or docs that are hard to find, cost as much as too few. Before adding a page, check whether an existing one should be extended or trimmed instead, and cut stale or duplicated text when you find it.

- **Doc comments.** Exported functions, types, and their fields in `domain/` and `application/` get a doc comment. Say what it's for and when to use it; give units and defaults.
- **A new subsystem gets a short guide** in `docs/architecture/`, in the same change: what it does, a Mermaid diagram or two, and a worked example, preferably a trace generated by a test so it can't go stale. Aim for a 10-minute read; [How the simulation engine works](docs/architecture/simulation-engine.md) is the model.
- **Keep the [architecture overview](docs/architecture/architecture-overview.md)** and its Mermaid diagrams current in the same change that alters the structure.
- **AWS claims** go through the fidelity catalog, as in [Adding a component type](#adding-a-component-type).
- **Diagrams** are [Mermaid](https://mermaid.js.org/), so they live in the Markdown and show up in diffs. In VS Code, the "Markdown Preview Mermaid Support" extension renders them.
- **C4 diagrams** show the code at four levels, one diagram per level per place: context and containers (levels 1 and 2) in the architecture overview, one component diagram (level 3) in each guide, and a `classDiagram` (level 4) in the guide for a class whose collaborators a factory wires. Draw levels 1–3 as flowcharts styled like the [legend](docs/architecture/architecture-overview.md#the-system-at-a-glance), copying its `classDef` lines; Mermaid's own C4 diagrams don't lay out legibly.

### Where a document goes, and how it's found

Every document must be reachable from the map in the [root README](README.md#documentation), in one or two clicks.

- **A folder in `docs/` may have one `<folder>-overview.md`** (for example `architecture/architecture-overview.md`). If it does, the root README links to that overview and to nothing else in the folder, and the overview lists the folder's other documents. If it doesn't, the root README links to the folder's documents directly.
- **Adding a document:** list it in its folder's overview if there is one, or in the root README if not, in the same change.
- **[Getting started](docs/getting-started.md)** is the path for a new maintainer, not an index. Add a document to its reading order only if every new maintainer should read it.
- **File names say what the file is.** Don't add `README.md` files inside `docs/`; a tab or search result titled README doesn't tell you which one it is.

### ADRs

Record a significant decision as an ADR in `docs/adr/`, copying [the template](docs/adr/template.md), and list it in the [ADR overview](docs/adr/adr-overview.md). "Significant" is defined in [ADR-0001](docs/adr/0001-record-architecture-decisions.md).

- **Never edit an accepted ADR's body or decision.** To note how a later change affects it (a signature it quotes has changed, a file it links has moved), append a dated addendum.
- **To change the decision,** write a new ADR that supersedes it, and update only the old one's status line.
- **One exception:** ADRs 0002, 0003, and 0005 were edited in place when the project was renamed from Cloud Builder to Wind Tunnel, as a one-off.

## Branches and pull requests

Every change reaches `main` through a pull request. People and Claude sessions follow the same steps:

1. **Open an issue** and label it with the change's type: `feat`, `fix`, `refactor`, `test`, `docs`, or `chore` (the [commit types](#commits)).
2. **Branch from `main`** as `<label>/issue-<number>-short-slug`, for example `feat/issue-12-composition-root`.
3. **Commit on the branch** as often as you like. Branch commits don't need tidying, because the PR is squash-merged. Check off finished tasks in [`docs/implementation-plan.md`](docs/implementation-plan.md) on the branch.
4. **Push and open a PR.** Its title becomes the commit message on `main`, so write it in the [commit style](#commits). Put `Closes #<number>` in the description. CI runs `npm run check` on every PR.
5. **Review.** Run `/pr-review <number>` in a separate Claude Code session for an independent review (see [Reviews](#reviews)). The author answers every finding in its comment thread.
6. **Merge.** The maintainer approves a PR by squash-merging it. GitHub deletes the branch.

While a PR is open:

- Only sync with `main` when you need to (a conflict, or CI needs a change from `main`), and do it by merging `main` into the branch. Don't rebase or force-push a branch that's under review: reviewers and review replies point at its commits.
- If your branch was cut from another PR's branch and that PR is merged first, merge `main` into your branch as usual. The squash commit holds the same changes as the parent's commits your branch already has, so they usually merge cleanly; if the parent changed after you branched, resolve the conflicts in the merge.

The repository allows only squash merges, and a ruleset stops `main` from being deleted or force-pushed.

### Reviews

[`/pr-review`](.claude/commands/pr-review.md) is a project command for Claude Code. It checks the PR in its own worktree against this guide, tries to make each new test fail, and posts one review whose comments start with `🤖 Claude review:`. Each finding is tagged **[blocking]**, **[should fix]**, or **[nit]**, and **confirmed** or **suspected**. Run it again after the author answers: a follow-up round checks each answer and reviews only the commits pushed since. The reviewer never pushes, approves, or merges.

The author answers each finding in its thread with the commit that fixes it, or a reason not to. Claude authors start each reply with `🤖 Claude (author):`, because every comment posts under the maintainer's account.

A PR is done when CI is green, every finding is answered, where a test applies the tests check the success case and the invariants and fail when the code they cover breaks, and the maintainer has merged it.

### Claude sessions

- On an issue branch, Claude commits, pushes, and opens or updates the PR without asking first. The PR is where the maintainer reviews the work. Claude never commits to `main` directly.
- Use `/pr-review` from a different session than the one that wrote the PR, so the review starts from a clean context.

## Commits

- One logical change per PR, with its tests and docs. Each PR becomes one commit on `main`, and `npm run check` passes on every PR.
- PR titles, and so the commits on `main`, are one line in the form `type(scope): summary`, in the imperative. Branch commits use the same form.
  - **type:** `feat`, `fix`, `refactor`, `test`, `docs`, or `chore`.
  - **scope:** the layer or area: `domain`, `application`, `adapters`, `ui`, `plan`. Leave it out when a change spans several.
  - For example: `feat(domain): add SQS visibility timeout`.
- Refactors go in their own PR, merged before the behavior change (see [Refactor first](#coding-standards)), so `main` shows the refactor on its own.
