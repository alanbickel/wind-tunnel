# ADR-0004: Persist projects in IndexedDB as versioned documents; ship templates as bundled data

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

Users need to save their projects (architecture, workflows, workloads, and canvas layout) between sessions. The app has no backend ([ADR-0003](0003-browser-only-react-typescript-app.md)), so storage must be in the browser. `localStorage` is synchronous, string-only, and limited to a few MB, which is too small once simulation results are stored.

We also want to ship a few starter projects ("templates") so new users have something to run right away.

## Decision

### Storage

- Use **IndexedDB**, accessed through the small promise wrapper [`idb`](https://github.com/jakearchibald/idb).
- IndexedDB code lives only in `src/adapters/persistence/` and implements a `ProjectRepository` port defined in `src/application/ports/`. No other layer knows IndexedDB exists.
- Unit tests use [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB) so the adapter can be tested in Node.

### One document per project

- Store each project as **one document** in a `projects` object store, not normalized into separate component/edge/workflow stores. Projects are small, are always loaded whole, and must be saved atomically. Normalizing them would add joins and consistency problems with no query benefit.
- The stored document is a **persistence DTO**, separate from the domain entities. A mapper in the adapter converts between them, so the domain model can be refactored without changing what's on disk.
- The same document format is used for **JSON export/import and sharing**, so there is one serialization format, not several.
- Canvas positions are stored in a separate `layout` section of the document, keyed by component ID, so domain entities don't carry UI coordinates.
- Simulation results, when we persist them, go in a separate `runs` store indexed by project ID, because they're large and loaded separately.

### Two kinds of versioning

- **IndexedDB database version** covers object stores and indexes. It's upgraded in the `idb` `upgrade` callback.
- **`schemaVersion` field in each document** covers the document's shape. Migrations are pure functions (`v1 → v2 → …`) applied on load. They run for both IndexedDB reads and JSON imports, since an exported file from an older version must still open.

### Templates are bundled, not seeded

- Templates ship as static JSON files in the app bundle (`src/adapters/templates/`), using the same document format.
- They are **not** written into IndexedDB on first launch. "New project from template" copies a template into a new project with a fresh ID and records `source: { templateId, templateVersion }`.

## Consequences

- Updating a template in a new release takes effect immediately for everyone, and never overwrites a user's edited copy. Seeding into IndexedDB would have left stale copies and conflicts with user edits.
- Templates are always present, even if the user clears their browser storage.
- Templates double as fixtures for engine tests and as examples of the document format.
- Data lives in one browser on one device. Users who want backups or to move projects must use export. Browsers may evict IndexedDB data under storage pressure, so we should call `navigator.storage.persist()` and make export easy to find.
- The exact document schema is defined in the design doc once the domain model is settled, and is linked from here.
