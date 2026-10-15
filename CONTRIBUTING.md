# Contributing

This guide covers how to set up, the rules the code follows, and how to test, document, and commit a change. If you're new to the codebase, start with the [documentation hub](docs/README.md); its reading order takes about an hour.

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
- `npm run simulate -- --template a` runs a template headlessly and prints a text report. Use it to see what a model change does before and after ([guide](docs/architecture/headless-runner.md)).
- Work is planned in milestones. [`docs/implementation-plan.md`](docs/implementation-plan.md) says what's in progress and what's next.

## Architecture rules

The code follows Clean Architecture ([ADR-0002](docs/adr/0002-use-clean-architecture-layering.md)); the [architecture overview](docs/architecture/README.md) explains where code goes. ESLint enforces the first two rules below, so a violation fails CI.

- **Imports point inward only:** `ui`/`adapters` → `application` → `domain`. `ui/` gets adapters through dependency injection and may import only types from `domain/`.
- **`domain/` and `application/` are deterministic.** No `Math.random`, `Date.now`, or `new Date`; no React, DOM, Worker, or Node APIs. Randomness comes from a seeded `RandomSource` and time from the `Clock` port, so the same seed always gives the same run. Libraries are allowed there only when an ADR approves them ([ADR-0005](docs/adr/0005-use-zod-for-schema-validation.md)).
- **Register, don't edit the engine (Open/Closed).** A new component type is a new `ComponentDefinition` added to the registry. It returns effects to the engine and never schedules events itself ([ADR-0006](docs/adr/0006-components-return-effects-to-the-engine.md)). See [Adding a component type](#adding-a-component-type).
- **Significant decisions get an ADR** in `docs/adr/` (copy [the template](docs/adr/template.md)). Accepted ADRs are not edited; a new ADR supersedes an old one.

## Coding standards

These heuristics encourage healthy habits and steer away from shapes that invite defects. Be kind to your fellow maintainers: if you wouldn't want to maintain it, don't commit it.

ESLint flags most violations as warnings (see [Enforcement](#enforcement)). Warnings don't fail CI; they're there to start a conversation, and an unexplained one shouldn't survive review.

**Exceptions** are allowed but must be justified in writing. If the reason isn't worth writing, the exception isn't worth making. Put the reason after `--` in the disable comment:

```ts
// eslint-disable-next-line max-params -- mirrors ComponentBehavior.arrive, which the engine calls per request
```

**Scope:** code we own. Code and signatures we don't control follow their owners: callbacks for the platform (DOM events, `Array.prototype` methods, React, Vitest) take the parameters the platform passes, and generated or vendored code keeps its upstream form.

**Existing code** was written before these rules and doesn't all meet them yet (`npm run lint` lists where). Don't fix it in passing as part of an unrelated change. When you need to change a function that breaks a rule, bring it into line first in its own `refactor` commit, then make your change. Reviewers can then check that the refactor changed no behavior.

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

Count the decision points: each `if`, `?:`, `&&`/`||`/`??`, loop, `case`, and `catch` counts as one. 5 or fewer is ideal. 6 to 8 is a yellow flag: write down why. 9 or more is a red flag, and ESLint warns.

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
  | { kind: "arrived"; timeMs: number; componentId: string }
  | { kind: "rejected"; timeMs: number; componentId: string; reason: string };

// ✓
interface ArrivedEvent { kind: "arrived"; timeMs: number; componentId: string }
interface RejectedEvent { kind: "rejected"; timeMs: number; componentId: string; reason: string }
type SimulationEvent = ArrivedEvent | RejectedEvent;
```

### 9. Put the unit in the name

A simulator is full of numbers that mean time, rates, and counts. A name without a unit invites mixing milliseconds with seconds. Durations and timestamps end in `Ms` (`timeoutMs`, `nowMs`, `retryAtMs`); rates say what they count per what (`requestsPerSecond`). Keep the engine in milliseconds and convert only at the edges, such as a report or a chart axis.

```ts
// ✗ 30 what?
const timeout = 30;

// ✓
const timeoutMs = 30_000;
```

### Enforcement

| Rule | ESLint rule | Level |
|---|---|---|
| 2. Rule of 30 | `max-lines-per-function` (30, skipping blanks and comments) | warn; off in tests |
| 5. Flat control flow | `max-depth` (2), `no-nested-ternary`, `no-else-return`, `no-lonely-if` | warn |
| 6. Complexity | `complexity` (8) | warn |
| 7. Two parameters | `max-params` (2) | warn; off in tests |
| 1, 3, 4, 8, 9 | None; reviewers check | |

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
- Latencies carry floating-point drift (`49.000000000000014`): compare them with `toBeCloseTo`.
- Model changes come with before/after numbers from `npm run simulate`.

### Docs backed by tests

Some docs quote output that a test generates or checks. Change them together:

| Doc | Test |
|---|---|
| Excerpts in the [engine](docs/architecture/simulation-engine.md), [component](docs/architecture/component-definitions.md), [domain model](docs/architecture/domain-model.md), and [metrics](docs/architecture/metrics.md) guides Snapshot traces in `src/domain/traces/`, from `traces.test.ts`. Accept an intended change with `npx vitest run -u src/domain/traces`, then update the excerpt in the guide |
| The sample reports in the [headless runner guide](docs/architecture/headless-runner.md) | Snapshots in `src/adapters/cli/reports/`; refresh with `npx vitest run -u src/adapters/cli` and read the diff |
| Each template's lesson in [MVP design §7](docs/design/mvp-design.md) | `src/adapters/templates/template-scenarios.test.ts` |

## Documentation

Write for a maintainer who is new to the codebase: say what something does and why, not only how.

- **Doc comments.** Exported functions, types, and their fields in `domain/` and `application/` get a doc comment. Say what it's for and when to use it; give units and defaults.
- **The [documentation hub](docs/README.md)** lists every document. Add a new one there in the same change.
- **Keep the [architecture overview](docs/architecture/README.md)** and its Mermaid diagrams current in the same change that alters the structure.
- **A new subsystem gets a short guide** in the same change: what it does, a Mermaid diagram or two, and a worked example, preferably a trace generated by a test so it can't go stale. Aim for a 10-minute read; [How the simulation engine works](docs/architecture/simulation-engine.md) is the model.
- **AWS claims** go through the fidelity catalog, as in [Adding a component type](#adding-a-component-type).

## Commits

- One logical change per commit, with its tests and docs. `npm run check` passes at every commit.
- One-line messages in the form `type(scope): summary`, in the imperative:
  - **type:** `feat`, `fix`, `refactor`, `test`, `docs`, or `chore`.
  - **scope:** the layer or area: `domain`, `application`, `adapters`, `ui`, `plan`. Leave it out when a change spans several.
  - For example: `feat(domain): add SQS visibility timeout`.
- Refactors go in their own commit, separate from behavior changes (see [Existing code](#coding-standards)).
