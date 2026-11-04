# ADR-0020: Give workflow steps stable IDs

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

A workflow is a call tree of steps ([MVP design §3.3](../design/mvp-design.md)). Components, edges, workflows, and workloads each have an ID, but a step doesn't. Code finds a step by its path in the tree: `["workflows", 0, "root", "calls", 1]`.

A path is enough to report a run issue, which is worked out fresh from the project each time. It isn't enough for the workflow editor ([#115](https://github.com/alanbickel/wind-tunnel/issues/115)), where the user selects a step and then edits around it. A path shifts whenever a sibling earlier in the list moves or is removed, so a selection held as a path would jump to a different step, or point at nothing, after an edit or an undo. Commands that change a step (#117) need to name it in a way that survives the changes before them.

Every stored project is a throwaway copy of a template, and nothing exports projects yet ([#21](https://github.com/alanbickel/wind-tunnel/issues/21)), so no user has a document worth migrating.

Options considered:

- **Keep paths, and fix them up after each edit.** No format change, but every command that moves or removes a step would have to rewrite every path anyone holds (the selection, the undo history's selections), and getting one wrong selects the wrong step without any error.
- **Give each step an ID.** A format change, so the document's `schemaVersion` goes up. Selection and commands name a step by ID, which no edit elsewhere in the tree changes.

## Decision

1. **Each step has a required `id`,** unique among all the project's steps, not only its workflow's. `validateArchitecture` checks the uniqueness with the other IDs, so a document with two steps sharing an ID doesn't open, and an edit that would make one doesn't save. New steps get their IDs from the `IdGenerator` port, as components and edges do. IDs are internal: never shown on screen, in a message for the user, or in the CLI's reports, where a step is named by its component and action.
2. **The document format moves to `schemaVersion` 2,** whose step schema requires the `id`.
3. **Version 1 is dropped, not migrated.** `CURRENT_SCHEMA_VERSION` is 2 and the migration map is empty, so a stored v1 project is still listed but opens on the "can't open" screen with "Unsupported schema version 1; this version of Wind Tunnel reads version 2." (Decided by the maintainer, 2026-11-04.)
4. **A template copy gets new step IDs.** The bundled templates carry readable step IDs (`create-order-fn-orders`), and `CreateProjectFromTemplate` replaces every one, async work included, with an ID from `IdGenerator`. A template copy's steps are then like a blank project's, and nothing can come to depend on a template's IDs.
5. **A step ID is identity, not content.** The engine and metrics ignore it. Run freshness ([ADR-0018](0018-tie-a-run-to-the-model-it-ran.md)) compares workflows by content, IDs included; that's sound because a run's copy is taken from the project, IDs and all, and no command changes a step's ID.

## Consequences

- Selection and the workflow editor's commands can hold a step by ID across edits and undo, with nothing to fix up.
- Every `Step` written in a test or fixture gains an `id`. Fixtures write them as literals (`db-read`, `get-api`) rather than through a helper that makes them, so each test shows the tree it builds; a fixture that's checked by `validateArchitecture` must keep its IDs unique.
- Projects saved in a browser before this change can't be opened. Clearing the site's IndexedDB removes them; there's no delete-project button yet.
- The first real migration waits for a format change made once there are documents worth keeping, such as exported files after #21. The migration machinery in `document-migrations.ts` stays, tested with its own example migrations.
- Readable IDs in a template are for whoever reads the JSON; a copy's IDs are opaque (`3f1c…` from `crypto.randomUUID()`), so a test can't look up a copied step by its template ID.
