# ADR-0009: Collaborators come from factories

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

Several classes build the objects they delegate to. `Simulation` creates its own `EventQueue` and `ArrivalProcess`; each AWS behavior creates its own `RateLimit`, `ServiceTime`, or `ConcurrencyLimit`; the contract harness creates its own `EventQueue` and `SeededRandom`s. That has three costs:

- **Hidden wiring.** To learn what a class depends on, a reader has to read its whole constructor, not its signature.
- **Hard to test in isolation.** A test can't hand the class a scripted queue or a fixed random stream; it has to drive the real ones through the public API.
- **Big classes.** Construction logic piles up next to the behavior. `simulation.ts` is 780 lines, partly because of this.

The rule needs a line between objects a class may create and objects it must be given, or it would forbid `new Map()`.

## Decision

No class or method creates its own dependencies. They come in through the constructor, typed as interfaces, and built by a factory function or a builder.

- A **dependency** is an object with behavior that the code delegates to: `EventQueue`, `ArrivalProcess`, `RateLimit`, `ServiceTime`, `ConcurrencyLimit`, `SeededRandom`, `MetricsCollector`, and anything like them.
- **State** may be created in place: built-ins (`Map`, `Set`, arrays, `Promise`, errors), plain records (`Visit`, `Attempt`), and pure accumulators that only store data (`LatencyHistogram`, `Tally`, the `Queue` inside `ConcurrencyLimit`).
- **`new` belongs in factories and composition roots.** Factories: `simulate`, `ComponentDefinition.build`, `createAwsComponentRegistry`, and functions like them. Composition roots: the CLI command, `main.tsx`, and tests.
- **Dependencies are typed as interfaces, never classes.** A constructor's collaborators arrive in one object whose type is named `<Class>Dependencies`, and each of its properties is an interface (or a function type). A class with `private` fields is effectively nominal in TypeScript: only its own instances satisfy its type, so a test can't hand in a fake without a cast. An interface lets a plain object stand in.
  - Use interfaces, not abstract base classes. Interfaces are erased at compile time, and a fake needs no inheritance.
  - The interface takes the role's name, and the class name says how it works: `ComponentRegistry` is implemented by `ComponentRegistryMap`. No `I` prefix.
  - State and data stay concrete, as above.

Two checks enforce this:

- ESLint rejects a `new` expression inside a class body unless the class is a built-in, is listed in `STATE_CLASSES` in `eslint.config.js`, or is named `*Factory` or `*Builder`. Test files are composition roots, so the selector is off there.
- An architecture test (`tests/architecture/dependency-types.test.ts`) uses the TypeScript compiler to resolve every property of every `*Dependencies` type in `src/`, and fails if any is a class.

## Consequences

- A class's constructor signature lists everything it delegates to, and tests can pass in scripted or fake collaborators as plain objects.
- Each class with collaborators needs a factory. That is more code in total, but the factory is the one place that answers "how is this wired?"
- Each dependency with one implementation now has two declarations, an interface and a class. That is the price of being able to fake it.
- Interfaces cost nothing at run time. Production code has one implementation per interface, so hot call sites in the engine stay monomorphic; fakes exist only in tests.
- The checks have blind spots, which reviewers cover. The lint selector only sees `new` written inside a class body, so it misses a class that calls a module-level helper which builds a dependency for it (as DynamoDB's `capacityBucket` does today). The architecture test only sees types named `*Dependencies`, so a constructor that doesn't follow the naming convention isn't checked.
- Deciding whether a new class is state or a dependency is a judgment call. A new pure accumulator goes in `STATE_CLASSES`, and the reviewer checks that it really delegates to nothing.
- Existing violations carry disable comments naming the R2 task that removes them: R2.5 (the engine), R2.6 (the contract harness), and R2.8 (the AWS behaviors and the test fakes).
