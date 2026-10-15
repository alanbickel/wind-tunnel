# ADR-0008: Ports exchange project records, not documents

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

A saved project has two kinds of data:

- The **simulation model**: architecture, workflows, workloads. The domain `Project` holds exactly this.
- **Facts about the project** that the engine doesn't use: when it was created and last updated, which template it came from (`source`), and where each component sits on the canvas (`layout`).

The stored format is the project document ([ADR-0004](0004-persist-projects-in-indexeddb.md), MVP design §6), defined as a Zod schema in `src/adapters/persistence/`. Use cases in `src/application/` need to set timestamps and keep the layout when saving, but they can't import the document type, because imports point inward only ([ADR-0002](0002-use-clean-architecture-layering.md)). ADR-0004 also keeps UI coordinates out of domain entities.

## Decision

- The application layer defines a **`ProjectRecord`** (`src/application/ports/project-record.ts`): the domain `Project` plus `createdAt`, `updatedAt`, `source`, and `layout`, as plain readonly data.
- `ProjectRepository` and `TemplateCatalog` take and return records. Adapters map records to and from documents; the application never sees a document, a `schemaVersion`, or a Zod schema.
- Timestamps are ISO 8601 strings in one format (`toISOString`'s, UTC with milliseconds). The `Clock` port returns that string rather than a `Date`, so `application` never constructs a `Date`, and timestamps sort correctly as strings (the IndexedDB `updatedAt` index relies on this).
- `ProjectRepository.get` returns `found`, `missing`, or `invalid`. An `invalid` result carries a `reason` (one plain sentence to show the user) and the validation `issues` behind it. A stored project can stop passing validation when a newer build tightens a rule, and the user should be told why it won't open, not shown a generic error.
- Every repository implementation must pass `checkProjectRepositoryContract` (`src/application/testing/`), so use cases tested against the in-memory fake behave the same with IndexedDB.

## Consequences

- Use cases can create, rename, and save projects without knowing the storage format, and the format can change (with a migration) without touching them.
- Canvas layout is visible to the application layer as opaque data. It still never reaches the domain or the engine.
- A new document-only field needs changes in three places: the document schema, `ProjectRecord`, and the mapper. The contract's round-trip check catches a mapper that forgets one, as long as `sampleRecord` sets every field.
- Templates come back as records too, so "new from template" is a copy with a new ID, new timestamps, and a `source`, the same in tests and in the app.
