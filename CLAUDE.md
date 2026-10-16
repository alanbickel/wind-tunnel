# Wind Tunnel

A workload simulator for exploring how application workflows behave under real-world stress. (Formerly "Cloud Builder"; the local folder still uses that name.) The vision (`cloud-builder-concept.md`) and future ideas (`TODO.md`) are local-only files, deliberately excluded from git; they may not exist in other clones.

## Current work

Read `docs/implementation-plan.md` at the start of every session. It records the current milestone, the next task, and a progress log. Update it as tasks are completed, and follow its "How to finish a milestone" steps (including compacting the plan) before the session ends. Keep working notes out of it.

## Architecture rules

- Follow Clean Architecture as described in `docs/adr/0002-use-clean-architecture-layering.md`. Imports point inward only: `ui`/`adapters` → `application` → `domain`.
- `domain/` and `application/` must stay free of React, DOM, Worker, `Math.random`, and `Date.now`. Nondeterminism goes through ports.
- Apply SOLID, especially Open/Closed for new component types (register, don't edit the engine).
- Start simple: get the core model and wiring working before UX polish.

## Coding standards

- Read the "Coding standards" section of `CONTRIBUTING.md` before writing code. All new and changed code follows it, tests included.
- Run `npm run check` before declaring work done. The coding-standard rules are errors: fix a violation, or justify the exception after `--` in the disable comment. ESLint and the architecture tests (`tests/architecture/`) check rules 2, 5, 6, 7, 10, and 11 only. Check the rest yourself: single-responsibility functions (1), guard clauses (3), lookup maps instead of branching (4), named types (8), units in names (9), dependencies built by helper functions that rule 10's lint selector can't see, and where role interfaces live (11).
- Don't fix existing violations in passing. If a function you need to change breaks a rule, bring it into line first in its own `refactor` commit.
- Commit messages follow `CONTRIBUTING.md`: `type(scope): summary`.

## Documentation rules

- Follow the "Documentation" section of `CONTRIBUTING.md`: guides for new subsystems, keeping the architecture overview current, where a document goes (the root README is the map), ADRs, and AWS claims in `docs/design/fidelity.md`.
- Add ideas for future work to `TODO.md`.
