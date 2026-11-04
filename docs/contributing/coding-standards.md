# Coding standards

These heuristics encourage healthy habits and steer away from shapes that invite defects. Be kind to your fellow maintainers: if you wouldn't want to maintain it, don't commit it.

ESLint and the architecture tests check some of these rules ([Enforcement](#enforcement)), and a violation fails `npm run check` and CI. Reviewers check the rest.

**Exceptions** are allowed but must be justified in writing. If the reason isn't worth writing, the exception isn't worth making. Put the reason after `--` in the disable comment:

```ts
// eslint-disable-next-line max-params -- mirrors ComponentBehavior.arrive, which the engine calls per request
```

A performance reason needs a measurement. The engine calls component methods (`arrive`, `finish`) many times per run; if you think an input object costs too much there, measure it with `npm run simulate` before claiming the exception.

**Scope:** code we own. Code and signatures we don't control follow their owners: callbacks for the platform (DOM events, `Array.prototype` methods, React, Vitest) take the parameters the platform passes, and generated or vendored code keeps its upstream form.

**Refactor first.** When a change would push a function over a limit, or the function already breaks a rule ESLint can't check, reshape it first in its own `refactor` PR, then make your change. Reviewers can then check that the refactor changed no behavior. Don't fix unrelated code in passing.

## 1. Single-responsibility functions

Orchestrators (use cases, commands, wiring, event dispatch) delegate, so they read like a list of steps; each calculation or transformation lives in a named function of its own.

## 2. Rule of 30

At most 30 lines of logic per function (blank lines and comments don't count). Over that, split it or write down why not.

ESLint counts a nested function's lines toward the function around it. A `build()` that returns an object literal full of methods, as the component definitions do, adds up fast. Move the methods into a named class or into functions of their own.

## 3. Return early (guard clause)

Handle defaults, invalid input, and base cases first and return, then do the main work unindented.

## 4. Look up, don't branch

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

Outside `ui/`, don't write these maps from scratch: [`src/domain/shared/kind-handlers.ts`](../../src/domain/shared/kind-handlers.ts) has `KindHandlers` and `handleKind` for discriminated unions, and `lookup` for `Record` tables. `ui/` may import only the `KindHandlers` type from `domain/`, so it writes its own dispatch. If a second place needs a helper that isn't there, add it to `domain/shared/` rather than writing it again.

## 5. Keep control flow flat

Nested conditionals, `else if` chains, and nested ternaries are red flags. There is always a flatter way: return early, look it up, or extract a function.

## 6. Keep complexity low

Count the decision points: each `if`, `?:`, `&&`/`||`/`??`, loop, `case`, and `catch` counts as one. 5 or fewer is ideal. 6 to 8 is a yellow flag: write down why. 9 or more is a red flag, and ESLint fails.

## 7. At most two parameters

Three or more parameters become one typed input object (`backoffMs({ policy, failedAttempts: 3, random })`); prefer one at two when the call doesn't say which is which, and callbacks that other layers implement, such as observers and `onSnapshot`, always take one.

## 8. Name your types

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

## 9. Put the unit in the name

Durations and timestamps end in `Ms` (`timeoutMs`, `nowMs`) and rates say what they count per what (`requestsPerSecond`); a component config field may use its AWS setting's unit instead (`idleTimeoutSec`), and the component converts it, because the engine works in milliseconds; convert to other units only at the edges, such as a report or a chart axis.

## 10. Collaborators come from factories

A class never creates the objects it delegates to. They come in through the constructor, typed as interfaces, and a factory function or composition root builds them ([ADR-0009](../adr/0009-collaborators-come-from-factories.md)). The constructor's signature then lists everything the class depends on, and a test can pass in a fake.

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

## 11. One class per file, named after it

Each class gets its own file, named after the class in kebab case: `ComponentRegistryMap` lives in `component-registry-map.ts`, and `IndexedDbProjectRepository` in `indexed-db-project-repository.ts`. A reader who sees a class name knows which file to open.

Interfaces follow what they're for:

- **A role interface gets its own file**, named after the interface, even when it has one implementation: `ComponentRegistry` in `component-registry.ts`, the ports in `application/ports/`. The role often lives in an inner layer and its implementations in an outer one, so they can't share a file anyway.
- **A class's own shapes stay in the class's file:** its `Input`, `Dependencies`, and result types. They mean nothing apart from the class.

Shared test fakes in `testing/` folders follow the rule. A `*.test.ts` file is exempt: it may keep small test doubles used only by its own tests beside them.

## Enforcement

Tooling checks most of the architecture rules and some of the coding standards, so a mistake fails `npm run check` (and CI) instead of waiting for review. Reviewers check the rest.

| Rule | Checked by | Level |
|---|---|---|
| Imports point inward only; `ui` imports only *types* from `domain`; nothing imports `main.tsx` | `@typescript-eslint/no-restricted-imports`, configured per layer in [`eslint.config.js`](../../eslint.config.js) | error |
| `domain` and `application` use only approved pure libraries (`zod` in `domain`, [ADR-0005](../adr/0005-use-zod-for-schema-validation.md)); tests there may also import `vitest` | The same rule, with an allowlist of packages | error |
| Only `src/ui/diagram/` imports `@xyflow/react`, and only `src/ui/charts/` imports `recharts` ([ADR-0010](../adr/0010-draw-diagrams-with-react-flow-behind-our-own-component.md), [ADR-0011](../adr/0011-draw-charts-with-recharts-behind-our-own-components.md)) | The same rule, with `WRAPPED_LIBRARIES` | error |
| No DOM, `Worker`, timers, or Node APIs in `domain` and `application` | TypeScript: [`tsconfig.core.json`](../../tsconfig.core.json) checks these folders without the DOM lib or Node types | type error |
| No `Math.random`, `Date.now`, `new Date()`, or `Date()` in `domain` and `application` | `no-restricted-properties` and `no-restricted-syntax` | error |
| Colors and lengths come from the design tokens, stylesheets live only in `src/ui/`, and nothing hides the focus ring ([ADR-0012](../adr/0012-style-the-ui-with-css-tokens-and-css-modules.md)) | [`tests/architecture/stylesheets.test.ts`](../../tests/architecture/stylesheets.test.ts) | test failure |
| 2. Rule of 30 | `max-lines-per-function` (30, skipping blanks and comments) | error; off in tests |
| 5. Flat control flow | `max-depth` (2), `no-nested-ternary`, `no-else-return`, `no-lonely-if` | error |
| 6. Complexity | `complexity` (8) | error |
| 7. Two parameters | `max-params` (2) | error; off in tests |
| 10. Collaborators from factories ([ADR-0009](../adr/0009-collaborators-come-from-factories.md)) | `no-restricted-syntax`: `new` inside a class body, except built-ins, `STATE_CLASSES`, and `*Factory`/`*Builder` | error; off in tests |
| 10. Dependencies are interfaces | [`tests/architecture/dependency-types.test.ts`](../../tests/architecture/dependency-types.test.ts) resolves each `*Dependencies` property's type with the TypeScript compiler and fails on a class | test failure |
| 11. One class per file | `max-classes-per-file` (1) | error; off in tests |
| 11. File named after its class | [`tests/architecture/class-files.test.ts`](../../tests/architecture/class-files.test.ts) fails if a class's file isn't its name in kebab case | test failure; skips tests |
| File length | `max-lines` (400, skipping blanks and comments) | warning; tests included |

Reviewers check what no tool does:

- Register, don't edit the engine, from the architecture rules.
- Rules 1, 3, 4, 8, and 9.
- Rule 10's gaps: a dependency built by a helper function the class calls, which the lint selector can't see, and a `Dependencies` type not named `*Dependencies`.
- Rule 11's gap: where a role interface lives.

[`tests/architecture/layer-rules.test.ts`](../../tests/architecture/layer-rules.test.ts) lints sample snippets in each layer and asserts that the layer rules fire; if you change the rules, update it. To approve a new library for `domain` or `application`, write an ADR, then add it to `DOMAIN_PACKAGES` or `APPLICATION_PACKAGES` in `eslint.config.js`.

**File length** is only a warning: it means "consider splitting this file", not "must fix". A file past 400 lines usually holds more than one idea, and a newcomer has to read all of it to find the one they need. Split along those ideas when you can name them; when the file really is one idea, leave it and move on.
