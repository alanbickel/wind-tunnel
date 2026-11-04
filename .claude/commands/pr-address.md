---
description: Answer the latest Claude review of a Wind Tunnel pull request, fixing findings on the PR branch
argument-hint: <pr-number>
---

You're the author of pull request #$ARGUMENTS on Wind Tunnel, answering its latest `🤖 Claude review:`. Answer every open finding with one answer tag, fix what you fix in commits on the PR branch, and push. [`.claude/review-protocol.md`](../review-protocol.md) sets the tags and which answers each finding allows. Follow it exactly: the next review round reads your answers by their tags.

## Setup

1. Read `.claude/review-protocol.md`, then `CLAUDE.md` and `CONTRIBUTING.md`, especially "Coding standards", "Tests", and "Documentation". Fixes follow the same standards as any other code.
2. Look up the PR, the issue it closes, and the latest Claude review:
   ```
   gh pr view $ARGUMENTS --json title,body,headRefName,headRefOid,closingIssuesReferences,reviews,mergeable
   gh api repos/{owner}/{repo}/pulls/$ARGUMENTS/comments
   node scripts/review-threads.js list $ARGUMENTS
   gh pr view $ARGUMENTS --comments
   ```
   Read the issue it closes (`gh issue view <n>`), including its comments.
3. Another session may be working in this checkout, so don't switch branches here. Fix the PR in its own worktree, `../wind-tunnel-address-$ARGUMENTS`. A headless run's launcher creates it before the session starts, because a session can only be given a folder that already exists (`--add-dir`). Check whether it's there with `git worktree list`.
   - **It's there:** use it if it's on `<headRefName>` and `git -C ../wind-tunnel-address-$ARGUMENTS status --short` shows no changes. If it's on another branch or has changes, stop and say so: the changes may be an earlier session's unsaved work.
   - **It isn't** (an interactive session): create it.
     ```
     git worktree prune
     git worktree add ../wind-tunnel-address-$ARGUMENTS <headRefName>
     ```
     If `git worktree add` refuses because the branch is checked out somewhere else, stop and say where.

   Then bring it up to date and install:
   ```
   git fetch origin
   git -C ../wind-tunnel-address-$ARGUMENTS merge --ff-only origin/<headRefName>
   npm --prefix ../wind-tunnel-address-$ARGUMENTS ci
   ```
   Never pass `--force`, delete the worktree with `rm`, stash, or discard. If you can't read or edit files in it, stop and say so; don't work around it.
   Make every fix, commit, and push in the worktree. When you're done and have pushed, remove it with `git worktree remove ../wind-tunnel-address-$ARGUMENTS`.

Write every file you create that isn't part of a fix (a comment's body) in `.review-tmp/` at the root of the checkout you started in, not in the worktree or the system temp directory. It's gitignored, and it's where a headless session is allowed to write outside the worktree. Leave the files there; the next run overwrites them.

### Shell commands

A headless session can't approve a prompt, so a command that needs one fails. Write commands that the allow list matches:

- One command per call where you can. Don't `cd` before a `git` command; use `git -C ../wind-tunnel-address-$ARGUMENTS`.
- Run npm in the worktree with `npm --prefix ../wind-tunnel-address-$ARGUMENTS run <script>`.
- Write paths out in full. Don't use shell variables (`W=...; $W/src`), `$TEMP`, output redirection to a file, or heredocs.
- Read and search with the Read and Grep tools, and change files with Edit and Write. Don't write a script to make edits for you.

## What to answer

- **Inline findings:** each unresolved thread whose first comment starts with `🤖 Claude review:` and has no answer since the reviewer's last comment in it. Skip a thread whose newest comment is a `🤖 Claude question:`: it's waiting for the maintainer, not for you.
- **Findings in the review summary** (findings on lines outside the diff, given as `path:line`): answer them all in one PR comment that starts with `🤖 Claude (author):`, with one numbered answer per finding, in the summary's order.
- **A reply from the maintainer** (no `🤖` prefix) outranks the finding. Do what it says and answer with the tag that fits, or push back if you disagree or aren't sure what it means, as the protocol's "The maintainer's comments" describes. A maintainer comment that answers a `🤖 Claude question:` on the PR or the issue is a reply in the thread of each finding the question links. Remove `needs-decision` only as the protocol's "Removing `needs-decision`" says.
- Don't answer threads that are resolved. Don't fix a finding the reviewer tagged [decision]: answer it with a link to the reviewer's question (see **[decision]** below).

## Choosing an answer

For each finding, pick an answer that the review protocol allows for its tag:

- **[fixed]:** the default for [blocking] and [should fix] findings you agree with. Fix it as the finding suggests, or another way if that's better (say why). Add or change a test where one applies, with its `// Fails if` comment.
- **[won't fix]:** you disagree, or it's outside the issue's scope and not a defect. Give the reason in a sentence or two. Only where the protocol allows it for the finding's tag.
- **[deferred] #N:** a real problem, but not one to fix here. Look for an issue that already covers it (`gh issue list --search "<words>"`). If none does, and it's a defect, file a `fix` issue:
  - title in the commit style, for example `fix(ui): flush a pending keyboard move before Undo`
  - body: what's wrong, the reviewer's reproduction, a suggested fix, and `Found in the review of #$ARGUMENTS: <link to the finding's comment>`
  - label `fix`
  Don't file feature issues. Something that would be new feature work, not a fix, is [won't fix] with a note that it could be a future item, or a [decision] if you think it matters now.
- **[decision]:** the reviewer tagged it [decision], or you can't settle it. Don't try to fix it. If the reviewer tagged it, it has already posted a `🤖 Claude question:`: reply in the thread with a link to that question, and post nothing new. If you're the one escalating it, post a question (below) and reply with a link to yours. Any finding can take this answer, a [defect] included.

### Answering a [defect]

The protocol's [defect] rule says when each answer applies. Try them in this order: **[fixed]**, then **[deferred] #N**, then **[decision]**. A [decision] you escalate stops the session (see "Questions for the maintainer").

## Making the fixes

1. Fix, test, and commit on the branch. One commit per finding, or one for a few related ones, in the commit style (`fix(ui): ...`).
2. Run the docs drift check from CONTRIBUTING's "Documentation" for whatever your fixes rename or change.
3. Sync with `main` only if the PR conflicts (`mergeable` is `CONFLICTING`) or CI needs a change from `main`: `git -C ../wind-tunnel-address-$ARGUMENTS merge origin/main`. Never rebase, amend, or force-push.
4. Run `npm --prefix ../wind-tunnel-address-$ARGUMENTS run check`. It must pass before you push.
5. `git -C ../wind-tunnel-address-$ARGUMENTS push`.

## Posting the answers

After the push, so the commits you name exist on GitHub, reply in each finding's thread:

```
gh api repos/{owner}/{repo}/pulls/$ARGUMENTS/comments/<first-comment-id>/replies --method POST -f body=<reply>
```

Start each reply with `🤖 Claude (author):` and the answer tag, then what you did. Examples:

- `🤖 Claude (author): **[fixed]** in a1b2c3d. The status region now mounts empty. New test "announces the create in a status region that was already there" goes red with the old code.`
- `🤖 Claude (author): **[won't fix]** Renaming the hook is outside #112's scope, and the current name matches the other three hooks in the folder.`
- `🤖 Claude (author): **[deferred] #131** The race is in the keyboard-move code from #110, which this PR doesn't touch.`
- `🤖 Claude (author): **[decision]** Asked the maintainer: <question URL>`

Don't resolve threads. The reviewer resolves the ones it accepts.

## Questions for the maintainer

For each finding you escalate to [decision] yourself, post a question on the PR (`gh pr comment $ARGUMENTS --body-file .review-tmp/question-$ARGUMENTS.md`). Start it with `🤖 Claude question:`, say what needs deciding, the options, and which you recommend and why, and link the finding. Then add the label: `gh pr edit $ARGUMENTS --add-label needs-decision`. Answer the other findings first, then stop.

## Recording your choices

Post one comment on the issue the PR closes (`gh issue comment <n> --body-file .review-tmp/decisions-$ARGUMENTS.md`), starting with `🤖 Claude decisions:` and naming the PR and review round. List the choices you made without asking: each deferral and the issue it went to, each won't-fix and why, a fix done differently from the reviewer's suggestion, and any documentation you added or chose not to add. Skip it if every answer was a plain [fixed].

When you're done, tell the user in a few lines: how many findings got each answer, the commits pushed, any issues filed, and the question's URL if you posted one.
