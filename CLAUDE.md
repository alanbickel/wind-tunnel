# Cloud Builder

Browser-based cloud architecture workload simulator. The vision (`cloud-builder-concept.md`) and future ideas (`TODO.md`) are local-only files, deliberately excluded from git; they may not exist in other clones.

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
