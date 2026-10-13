# ADR-0005: Use Zod for schema validation, including in the domain layer

- **Status:** Proposed
- **Date:** 2026-10-13

## Context

Cloud Builder reads data it cannot trust at compile time:

- project documents from IndexedDB, which may have been written by an older version ([ADR-0004](0004-persist-projects-in-indexeddb.md))
- JSON files imported by users
- bundled templates
- messages passed to and from the simulation Web Worker

Each component type also has a config (e.g. Lambda's concurrency limit) that must be checked before it's used. Under [ADR-0002](0002-use-clean-architecture-layering.md), adding a component type should mean registering one definition, so each definition must carry its own config validation.

Writing validators by hand duplicates every TypeScript type as runtime checks, and the two copies drift apart.

## Decision

Use [Zod](https://zod.dev/) (version 4) to define schemas. TypeScript types are derived from the schemas with `z.infer`, so each shape is defined once.

**Where Zod is allowed:**

- `adapters/`: schemas for the persistence document, imports, templates, and worker messages.
- `domain/`: **only** for component config schemas, exposed by each component definition as `configSchema`. This is a deliberate exception to "the domain has no dependencies".

**Why the domain exception is acceptable:** Zod is a pure library with no I/O, no globals, and no framework behind it; it acts like an extension of the type system. Keeping it out of the domain would force either hand-written duplicate validators, or config schemas kept in the adapters, which would mean every new component type requires an adapter edit (breaking Open/Closed).

**Rule for future exceptions:** a third-party library may be used in `domain/` or `application/` only if it is pure (no I/O, no globals, no framework), and only after an ADR approves it. The import-boundary lint config lists the approved libraries explicitly.

**Boundary rule:** untrusted data is parsed (`schema.safeParse`) at the moment it enters the app. Code past that point works with typed values and doesn't re-validate.

## Consequences

- Each data shape is defined once, as a schema, and types follow from it.
- Validation errors include paths (e.g. `architecture.components[3].config.concurrency`), which makes import errors readable for users.
- The domain depends on Zod. Replacing Zod later would mean rewriting component config schemas, which is limited in scope.
- Zod adds roughly 10 to 15 KB (gzipped) to the bundle, which is acceptable for this app.
