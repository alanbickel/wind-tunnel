# Wind Tunnel

A workload simulator for exploring how application workflows behave under real-world stress. (Formerly "Cloud Builder"; the local folder still uses that name.) The vision (`cloud-builder-concept.md`) and future ideas (`TODO.md`) are local-only files, deliberately excluded from git; they may not exist in other clones.

## Current work

Read `docs/implementation-plan.md` at the start of every session. It records the current milestone, the next task, and a progress log. Update it as tasks are completed, and follow its "How to finish a milestone" steps (including compacting the plan) before the session ends. Keep working notes out of it.

## Architecture rules

- Follow Clean Architecture as described in `docs/adr/0002-use-clean-architecture-layering.md`. Imports point inward only: `ui`/`adapters` → `application` → `domain`.
- `domain/` and `application/` must stay free of React, DOM, Worker, `Math.random`, and `Date.now`. Nondeterminism goes through ports.
- Apply SOLID, especially Open/Closed for new component types (register, don't edit the engine).
- Start simple: get the core model and wiring working before UX polish.

## Documentation rules

- Write docs for maintainers who are new to the codebase.
- Record significant decisions as ADRs in `docs/adr/` (template: `docs/adr/template.md`). Accepted ADRs are immutable; supersede them instead of editing.
- Keep `docs/architecture/README.md` and its Mermaid diagrams current in the same change that alters the structure.
- Add ideas for future work to `TODO.md`.
