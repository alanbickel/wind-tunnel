# Wind Tunnel

A workload simulator for exploring how your application's cloud architecture behaves under real-world usage. (Formerly "Cloud Builder"; the local folder still uses that name.) The vision (`cloud-builder-concept.md`) is a local-only file, deliberately excluded from git; it may not exist in other clones. The work backlog is the repository's GitHub issues.

## Current work

At the start of every session, read the Roadmap (`gh issue view 32`, pinned) and pick the next task as CONTRIBUTING's "Milestones and the roadmap" says. Read that issue before starting.

## Architecture rules

- Follow CONTRIBUTING's "Architecture rules".
- Start simple: get the core model and wiring working before UX polish.

## Coding standards

- Read the "Coding standards" section of `CONTRIBUTING.md` before writing code. All new and changed code follows it, tests included.
- While working, check with `npm run check:changed`. It usually takes seconds, because it runs only the tests whose imports reach a file changed since `main` (committed or not), and lints and format-checks only files changed since its last run. It can miss what the full check catches: ESLint's type-aware rules may not re-check an unchanged file whose types changed elsewhere, and the architecture tests in `tests/architecture/` read `src/` from disk rather than importing it, so a change in `src/` doesn't rerun them. Run the full `npm run check` before declaring work done or opening a PR. The coding-standard rules are errors: fix a violation, or justify the exception after `--` in the disable comment. Check the rules that CONTRIBUTING's Enforcement table leaves to reviewers yourself.
- Branches, PRs, and commit messages follow `CONTRIBUTING.md` ("Branches and pull requests"; titles are `type(scope): summary`). Review PRs with `/pr-review <number>`.
- On an issue branch, commit, push, and open or update the PR without asking first. The PR is where the maintainer reviews the work. Never commit to `main` directly.

## Documentation rules

- Follow the "Documentation" section of `CONTRIBUTING.md`: guides for new subsystems, keeping the architecture overview current, where a document goes (the root README is the map), ADRs, and AWS claims in `docs/design/fidelity.md`.
- Record what you chose to document, and what you left out, in the issue's `🤖 Claude decisions:` comment, as `.claude/review-protocol.md` says.
- File ideas for future work as labeled GitHub issues, not in `TODO.md` (a local file kept only as a temporary reference until its items move to issues). Move them in small batches, as they're scheduled: don't open issues faster than they're worked. Remove an item from `TODO.md` once it's filed, and point any other item that refers to it at the new issue.
