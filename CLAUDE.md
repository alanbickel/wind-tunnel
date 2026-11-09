# Wind Tunnel

A workload simulator for exploring how your application's cloud architecture behaves under real-world usage. (Formerly "Cloud Builder"; the local folder still uses that name.) The vision (`cloud-builder-concept.md`) is a local-only file, deliberately excluded from git; it may not exist in other clones. The work backlog is the repository's GitHub issues.

The repository's rules are in `CONTRIBUTING.md` and its pages in `docs/contributing/`. This file says only how a session works and what to read when; it never restates a rule.

## Starting a session

Read the Roadmap (`gh issue view 32`, pinned) and pick the next task as CONTRIBUTING's "Milestones and the roadmap" says. Read that issue, with its comments, before starting.

## What to read

Read `CONTRIBUTING.md` (the hub: setup, architecture rules, the rule headlines, the PR steps) at the start of any task, then the pages the task needs:

| Before you… | Read |
|---|---|
| write or change code, tests included | `docs/contributing/coding-standards.md` |
| write or change a test | `docs/contributing/testing.md` |
| write or change a doc, a guide, or an ADR | `docs/contributing/documentation.md` |
| decide where new code goes | the "Where does my code go?" table in `docs/architecture/architecture-overview.md`, then the guide it names |
| add a component type | CONTRIBUTING's "Adding a component type" |
| review a PR, or answer a review | `.claude/commands/pr-review.md` or `pr-address.md`, which say what else to read |

## While working

- Start simple: get the core model and wiring working before UX polish.
- Check with `npm run check:changed` as you go. It usually takes seconds, because it runs only the tests whose imports reach a file changed since `main` (committed or not), and lints and format-checks only files changed since its last run. It can miss what the full check catches: ESLint's type-aware rules may not re-check an unchanged file whose types changed elsewhere, and the architecture tests in `tests/architecture/` read `src/` from disk rather than importing it, so a change in `src/` doesn't rerun them. It also skips the build. Run the full `npm run check` before declaring work done or opening a PR.
- Lint can't check every coding standard. Check the ones that the Enforcement table in `coding-standards.md` leaves to reviewers yourself.

## Commits, PRs, and reviews

- On an issue branch, commit, push, and open or update the PR without asking first. The PR is where the maintainer reviews the work. Never commit to `main` directly.
- Record what you chose to document, and what you left out, in the issue's `🤖 Claude decisions:` comment, as `.claude/review-protocol.md` says.

## Follow-up work

File ideas for future work as labeled GitHub issues, not in `TODO.md` (a local file kept only as a temporary reference until its items move to issues). Move them in small batches, as they're scheduled: don't open issues faster than they're worked. Remove an item from `TODO.md` once it's filed, and point any other item that refers to it at the new issue.
