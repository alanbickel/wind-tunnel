---
description: Review a Wind Tunnel pull request as an independent reviewer and post the findings as PR comments
argument-hint: <pr-number>
---

You're reviewing pull request #$ARGUMENTS on Wind Tunnel as an independent reviewer. Another Claude session or a human wrote it. Review it with fresh eyes, and don't assume the author's checks were complete.

## Setup

1. Look up the PR, its head branch, the issues it closes, and earlier reviews, then the inline comment threads (author replies appear only there):
   ```
   gh pr view $ARGUMENTS --json title,body,headRefName,headRefOid,closingIssuesReferences,reviews
   gh api repos/{owner}/{repo}/pulls/$ARGUMENTS/comments
   gh pr diff $ARGUMENTS
   ```
   Read each issue it closes (`gh issue view <n>`).
2. Read `CLAUDE.md`, `CONTRIBUTING.md`, and `docs/implementation-plan.md`. Their standards are the review criteria.
3. Another session may be working in this checkout, so don't switch branches here. Review in a separate worktree (the first line clears one left by an earlier run):
   ```
   rm -rf ../wind-tunnel-review-$ARGUMENTS; git worktree prune
   git fetch origin
   git worktree add ../wind-tunnel-review-$ARGUMENTS <headRefOid>
   ```
   Use the `headRefOid` from step 1, not the branch, so the worktree and the posted review are at the same commit even if the author pushes meanwhile.
   In the worktree, run `npm ci`.
   When you're done, remove it with `rm -rf ../wind-tunnel-review-$ARGUMENTS; git worktree prune`. (On Windows, `git worktree remove` fails on long `node_modules` paths and leaves the directory behind.)

## Follow-up mode

If the PR already has a review whose body starts with `🤖 Claude review:`, this is a follow-up round:

- For each earlier finding, read the author's reply in its comment thread and the commit the reply names. Check that the fix works and that it has a test where one applies (see "Definition of done" below).
- Review only what changed since the latest Claude review. Get the commit it reviewed (a full SHA):
  ```
  gh pr view $ARGUMENTS --json reviews --jq '[.reviews[] | select(.body | startswith("🤖 Claude review:"))] | last | .commit.oid'
  ```
  Branches sync with main by merging, never by rebasing, so that commit is still on the branch. Review the branch's own commits since then, leaving out what came in from main:
  ```
  git log -p --first-parent --no-merges <sha>..HEAD
  ```
  For each merge from main in that range (`git log --first-parent --merges <sha>..HEAD`), check only how its conflicts were resolved with `git show --remerge-diff <merge>`. If `git merge-base --is-ancestor <sha> HEAD` fails, the branch was force-pushed: review the whole PR again and say so in the summary.
- Don't repeat earlier findings that were fixed.

## What to check

1. **Does it do what the issue asks?** Check each point and each out-of-scope item. Check that the claims in the PR description are true.
2. **Correctness.** Look for edge cases: empty, zero, infinite, removed items, a run that ends with work still in progress. Check that the same seed still gives the same run.
3. **Architecture rules** (CONTRIBUTING §Architecture rules): imports point inward only; `domain/` and `application/` stay free of React, DOM, Worker, Node APIs, `Math.random`, `Date.now` and `new Date`; a new component type is registered, not added to the engine; a significant decision has an ADR, and no accepted ADR's body or decision was edited.
4. **Coding standards that ESLint can't check:** single-responsibility functions (1), guard clauses (3), lookup maps instead of branching (4), named types and parameter-object names (8), units in names (9), collaborators built by helper functions that rule 10's lint selector can't see, and where role interfaces live (11). Exceptions need a reason after `--` in the disable comment. A refactor of existing code belongs in its own PR, not mixed with a behavior change. Leave out what ESLint and Prettier already enforce.
5. **Tests and docs** (CONTRIBUTING §Tests and §Documentation):
   - Outputs reconcile: any new counter or column has a check that the totals add up.
   - A doc that quotes test output ("Docs backed by tests") is updated with the snapshot it quotes.
   - Model changes come with before/after numbers from `npm run simulate`; rerun it to confirm them.
   - AWS claims go through `docs/design/fidelity.md`.
   - New subsystems have a guide; the architecture overview and its diagrams match the new structure; every new document is reachable from the root README's map; exported `domain/` and `application/` code has doc comments with units and defaults.
   - `docs/implementation-plan.md` reflects the tasks the PR finishes.
   - Code reads like the surrounding code: same naming, comment density and idioms.
6. **Tests must be able to fail.** For each new or changed test, break the code it covers in the worktree (revert the fix, or violate the invariant) and confirm the test goes red. A test that stays green is a finding.
7. **Accessibility** of any UI change: semantics, keyboard, and what a screen reader would announce.
8. **Verify, don't guess.** Run `npm run check`. Mark each finding as **confirmed** (reproduced, or traced in the code) or **suspected**.

## Definition of done

Say in the summary whether the PR meets each of these:

- CI is green (`gh pr checks $ARGUMENTS`).
- Every finding from earlier rounds is answered.
- Where a test applies, tests assert the success case and the invariants that must hold, and they fail when the code they cover is broken.

The maintainer's approval is the last step, and you can't give it.

## Posting the review

Post a single review with inline comments:

```
gh api repos/{owner}/{repo}/pulls/$ARGUMENTS/reviews --method POST --input review.json
```

```json
{
  "commit_id": "<headRefOid from Setup step 1>",
  "event": "COMMENT",
  "body": "<summary>",
  "comments": [
    { "path": "path/to/file.ts", "line": 42, "side": "RIGHT", "body": "<finding>" }
  ]
}
```

- Set `commit_id` to the commit you reviewed. Without it, GitHub records whatever the head is when the review posts, and the next follow-up round would skip any commits pushed in between.
- `event` must be `COMMENT`. The PR author is the same GitHub account, so APPROVE and REQUEST_CHANGES fail.
- Start the summary body and every inline comment body with `🤖 Claude review:`. The comments post under the maintainer's account, and follow-up mode finds earlier rounds by that prefix.
- Anchor inline comments on lines inside the diff. GitHub rejects the whole review if any comment points outside it. Put findings about other lines in the summary, with `path:line`.
- Tag each finding **[blocking]**, **[should fix]** or **[nit]**, and add confirmed or suspected.
- For each finding, say what's wrong, give a way to reproduce it (steps, a command, or a test that fails), and suggest a fix.
- Report at most 8 findings, the most important first.
- Write `review.json` outside the repo (for example in the system temp directory) so it isn't left in a checkout.
- Summary body: a verdict (ready to merge / merge after fixes / needs rework), the definition-of-done status, the commands you ran with their results, and anything you couldn't verify.

Don't push commits, edit the branch, or merge. When you're done, tell the user the review URL and the verdict in two or three lines.
