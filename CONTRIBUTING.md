# Contributing

This guide covers how to set up, the rules the code follows, and how to test, document, and merge a change. If you're new to the codebase, start with [Getting started](docs/getting-started.md); its reading order takes about an hour.

## Setup

Node 24 (see [`.nvmrc`](.nvmrc)).

```sh
npm install
npm run dev     # dev server
npm run check   # typecheck, lint, format check, tests, build: what CI runs
```

The [README](README.md#running-it) lists every script. A few things worth knowing up front:

- **Vitest doesn't type-check.** A green test run can hide a type error. Run `npm run check` (or at least `npx tsc -b`) before you trust it.
- **Run `npm run check` before you open a PR.** It takes about a minute. CI always runs it.
- Prettier owns formatting, and CI checks it. Run `npm run format` rather than formatting by hand.
- `npm run simulate -- --template template-a` runs a template headlessly and prints a text report. Use it to see what a model change does before and after ([guide](docs/architecture/headless-runner.md)).
- Work is planned in milestones. The pinned [Roadmap issue](https://github.com/alanbickel/wind-tunnel/issues/32) says what's in progress and what's next ([how it works](#milestones-and-the-roadmap)).

## Architecture rules

The code follows Clean Architecture ([ADR-0002](docs/adr/0002-use-clean-architecture-layering.md)); the [architecture overview](docs/architecture/architecture-overview.md) explains where code goes. Tooling enforces the first two rules below, so a violation fails CI ([Enforcement](docs/contributing/coding-standards.md#enforcement)).

- **Imports point inward only:** `ui`/`adapters` → `application` → `domain`. `ui/` gets adapters through dependency injection and may import only types from `domain/`.
- **`domain/` and `application/` are deterministic.** No `Math.random`, `Date.now`, or `new Date`; no React, DOM, Worker, or Node APIs. Randomness comes from a seeded `RandomSource` and time from the `Clock` port, so the same seed always gives the same run. Libraries are allowed there only when an ADR approves them ([ADR-0005](docs/adr/0005-use-zod-for-schema-validation.md)).
- **Register, don't edit the engine (Open/Closed).** A new component type is a new `ComponentDefinition` added to the registry. It returns effects to the engine and never schedules events itself ([ADR-0006](docs/adr/0006-components-return-effects-to-the-engine.md)). See [Adding a component type](#adding-a-component-type).

## Coding standards

Every change follows these rules, tests included. [Coding standards](docs/contributing/coding-standards.md) explains each with examples, how to justify an exception, and which rules tooling checks. Read it before you write code.

1. [Single-responsibility functions](docs/contributing/coding-standards.md#1-single-responsibility-functions)
2. [Rule of 30](docs/contributing/coding-standards.md#2-rule-of-30)
3. [Return early (guard clause)](docs/contributing/coding-standards.md#3-return-early-guard-clause)
4. [Look up, don't branch](docs/contributing/coding-standards.md#4-look-up-dont-branch)
5. [Keep control flow flat](docs/contributing/coding-standards.md#5-keep-control-flow-flat)
6. [Keep complexity low](docs/contributing/coding-standards.md#6-keep-complexity-low)
7. [At most two parameters](docs/contributing/coding-standards.md#7-at-most-two-parameters)
8. [Name your types](docs/contributing/coding-standards.md#8-name-your-types)
9. [Put the unit in the name](docs/contributing/coding-standards.md#9-put-the-unit-in-the-name)
10. [Collaborators come from factories](docs/contributing/coding-standards.md#10-collaborators-come-from-factories)
11. [One class per file, named after it](docs/contributing/coding-standards.md#11-one-class-per-file-named-after-it)

## Adding a component type

A new AWS service (or any other component type) touches these places, all in the same change:

1. A `ComponentDefinition` in `src/domain/components/`, registered in the registry, with its `defaultConfig` and `edgeDefaults` (a new edge's settings from a component of the type). The engine doesn't change. It lists every reason it rejects with in `rejectionReasons` ([rejection reasons](docs/architecture/component-definitions.md#rejection-reasons)). Each limit it enforces declares what it does when full: refuse, with one of those reasons, or make work wait ([what a full limit does](docs/architecture/component-definitions.md#what-a-full-limit-does)). The findings then cover the type without changes.
2. A test that runs `checkComponentContract` against it, plus tests for its own behavior.
3. For each place the model simplifies or guesses at AWS behavior, an entry in [`docs/design/fidelity.md`](docs/design/fidelity.md), with its ID cited in the code comment. Mark every claim about AWS as **Documented** (with a link you checked), **Observed**, or **Assumption**.
4. Anything surprising about the service at scale goes in [AWS: Did you know?](docs/learning/aws-did-you-know.md).
5. The [component definitions guide](docs/architecture/component-definitions.md), updated to list it.
6. Field descriptors for its settings, in `src/application/details/fields/`, listed in `createFieldCatalog`, with a `purpose`: the line "Add component" shows on what the type is for. For each setting: what it means to a user, in AWS terms, its default's evidence, and for a number its range, with a row for each in fidelity's [defaults table](docs/design/fidelity.md#default-values-and-their-evidence), and an `edgeEvidence` for its edge defaults, which fidelity's edge rows must back. `field-evidence.test.ts` fails until every setting has one, and `field-ranges.test.ts` until each range agrees with the config schema. The Details tab's fields and "Add component" come from the descriptors, so the type needs no UI code; `component-types.test.ts` fails until a registered type has its descriptors and their `purpose`.

## Tests and documentation

- [Tests](docs/contributing/testing.md): where tests go, what makes a good one, and the docs that quote test output.
- [Documentation](docs/contributing/documentation.md): what to document and where it goes, and how to write and amend ADRs.

## Gotchas

These apply everywhere. A gotcha that belongs to one area is in its guide: the Vitest ones are in [Tests](docs/contributing/testing.md#gotchas).

- **No constructor parameter properties.** `erasableSyntaxOnly` is on, so `constructor(private readonly queue: EventQueue)` doesn't compile. Declare the field and assign it in the constructor.
- **TypeScript is pinned to `~6.0`** because typescript-eslint doesn't support TypeScript 7 yet. For the same reason, the layer rules use typescript-eslint's `no-restricted-imports`, not ESLint's.

## Milestones and the roadmap

The pinned [Roadmap issue](https://github.com/alanbickel/wind-tunnel/issues/32) is the plan: the milestones in order, each with its items in order. A filed item is an issue number. Work not yet filed is a short *unfiled* stub that says what it is and records any decision already made about it. When a milestone becomes the current one, it gets a GitHub milestone, and its filed issues join it; items filed later join as they're filed. Until then, its filed issues have no GitHub milestone.

- **The next task** is the first item, in order, that isn't done (an open issue or an unfiled stub) in the first milestone that still has one. If it's a stub, file it, with at most the one or two after it, and put their numbers in the Roadmap before starting. Filing in small batches keeps the issue list to work that's about to start.
- **Edit the Roadmap** only to file stubs, reorder, add or reshape a milestone, or finish one. An ordinary PR doesn't touch it: `Closes #<number>` closes the issue, and the Roadmap shows it as done. To edit it, read the current body (`gh issue view 32 --json body --jq .body`), change that, and write it back with `gh issue edit 32 --body-file <file>`, so you don't overwrite someone else's edit.
- **Lessons for later work** go in [Gotchas](#gotchas) or the guide they belong to, not the Roadmap.

### Finishing a milestone

1. Every item is closed, and the milestone's goal is met. The maintainer checks anything that needs a browser.
2. The docs are current: the architecture overview, the design docs where reality differs from them, ADRs for significant decisions, a guide for each new subsystem, and every new document reachable from the README map ([Documentation](docs/contributing/documentation.md)).
3. Anything the next milestone needs to know is in Gotchas or the relevant guide.
4. The milestone moves to the Roadmap's "Done" list as one line with its PR numbers, and its GitHub milestone is closed.
5. The next milestone's stubs are revised if what we learned changes them, and its first items are filed.

## Branches and pull requests

The backlog is the repository's [GitHub issues](https://github.com/alanbickel/wind-tunnel/issues). File an idea for future work as an issue with its type label; an issue joins a milestone once it's scheduled. Feature work is filed in small batches, as [Milestones and the roadmap](#milestones-and-the-roadmap) describes. A defect is different: anyone, a Claude session included, may file a `fix` issue for a bug they find, at any time.

Every change reaches `main` through a pull request. People and Claude sessions follow the same steps:

1. **Open an issue** and label it with the change's type: `feat`, `fix`, `refactor`, `test`, `docs`, or `chore` (the [commit types](#commits)).
2. **Branch from `main`** as `<label>/issue-<number>-short-slug`, for example `feat/issue-12-composition-root`.
3. **Commit on the branch** as often as you like. Branch commits don't need tidying, because the PR is squash-merged.
4. **Push and open a PR.** Its title becomes the commit message on `main`, so write it in the [commit style](#commits). Put `Closes #<number>` in the description. CI runs `npm run check` on every PR.
5. **Review.** Run `/pr-review <number>` in a separate Claude Code session for an independent review, and answer it with `/pr-address <number>` (see [Reviews](#reviews)).
6. **Merge.** The maintainer approves a PR by squash-merging it. GitHub deletes the branch.

While a PR is open:

- Only sync with `main` when you need to (a conflict, or CI needs a change from `main`), and do it by merging `main` into the branch. Don't rebase or force-push a branch that's under review: reviewers and review replies point at its commits.
- If your branch was cut from another PR's branch and that PR is merged first, merge `main` into your branch as usual. The squash commit holds the same changes as the parent's commits your branch already has, so they usually merge cleanly; if the parent changed after you branched, resolve the conflicts in the merge.
- A PR whose base is another PR's branch closes for good when that branch is deleted on merge: GitHub can't reopen it or change its base. Before merging the parent, change the stacked PR's base to `main` (`gh pr edit <number> --base main`). If it already closed, open a new PR from the same branch, say in its description which PR it replaces, and comment on the closed one with a link to the new one.

The repository allows only squash merges, and a ruleset stops `main` from being deleted or force-pushed.

### Reviews

[`/pr-review`](.claude/commands/pr-review.md) is a project command for Claude Code. It reads the PR in its own worktree, checks it against this guide, and posts one review. Run it again after the author answers: a follow-up round checks each answer and reviews only the commits pushed since. The reviewer never pushes, approves, or merges. It doesn't run tests either: CI runs `npm run check`, and each test's `// Fails if` comment (see [Tests](docs/contributing/testing.md)) is the author's record that it can fail.

[`/pr-address`](.claude/commands/pr-address.md) is its counterpart for the author. It answers each finding of the latest review in the finding's thread, fixes what it fixes in commits on the branch, and pushes. Use it to answer a review in interactive and scripted sessions alike, so every answer uses the same tags. It can run in the session that wrote the PR; only the reviewer needs a fresh one.

A comment from the maintainer outranks both commands. A session can still disagree, offer an alternative, or ask what the maintainer meant, for as many rounds as it takes. The maintainer stating the same position twice in a row ends it. How the two commands tag their comments and answer each other is in [the review protocol](.claude/review-protocol.md), which only Claude sessions need to read.

A PR is done when CI is green, every finding has an answer the reviewer accepted, where a test applies the tests check the success case and the invariants and each new or changed test has a `// Fails if` comment naming a change that provably turns it red, and the maintainer has merged it.

## Commits

- One logical change per PR, with its tests and docs. Each PR becomes one commit on `main`, and `npm run check` passes on every PR.
- PR titles, and so the commits on `main`, are one line in the form `type(scope): summary`, in the imperative. Branch commits use the same form.
  - **type:** `feat`, `fix`, `refactor`, `test`, `docs`, or `chore`.
  - **scope:** the layer or area: `domain`, `application`, `adapters`, `ui`. Leave it out when a change spans several.
  - For example: `feat(domain): add SQS visibility timeout`.
