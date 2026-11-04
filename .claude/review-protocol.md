# Review protocol

How Claude sessions talk to each other through GitHub: `/pr-review`, `/pr-address`, an author session, and the development automation driver (`scripts/ai-dlc.js`, described in [AI-DLC.md](../AI-DLC.md)). Each of them reads this file; it is the only place these rules are written. People need only CONTRIBUTING's [Reviews](../CONTRIBUTING.md#reviews).

Every comment a Claude session posts goes out under the maintainer's account, so it starts with a prefix that says who wrote it and lets later sessions find it. A comment from the maintainer has no `🤖` prefix.

## Comment prefixes

| Prefix | Posted on | By | Purpose |
|---|---|---|---|
| `🤖 Claude review:` | PR: the review and its inline comments | `/pr-review` | Findings. The summary's first line is `🤖 Claude review: Verdict: <ready to merge \| merge after fixes \| needs rework> at <short sha>`, naming the commit reviewed. |
| `🤖 Claude (author):` | PR: a reply in a finding's thread | the author session and `/pr-address` | An answer to a finding, starting with its answer tag. |
| `🤖 Claude question:` | the issue, the PR, or a finding's thread, wherever it came up | any session | A decision for the maintainer: what needs deciding, the options, and a recommendation. The session adds the `needs-decision` label and stops. The label is the signal; whoever needs the questions finds the comments with this prefix. The maintainer answers in a comment after the question, or in the finding's thread. The label comes off only when every question on that PR or issue has an answer (see "The maintainer's comments"). |
| `🤖 Claude decisions:` | issue | the author session and `/pr-address` | Choices made without asking, so the maintainer can review several sessions' choices in one place: every deferral, and what the session chose to document, what it left out, and why. |
| `🤖 Claude deferred checks:` | issue | the author session, only in a driver run with `--defer-manual-checks` | The issue's "Done when" checks that need a person, as a Markdown checklist, left for the maintainer. The reviewer counts a listed check as met. The driver collects them onto the parent issue at the end of the run. |

## The maintainer's comments

A comment from the maintainer outranks any session's, but it isn't beyond question. A session that disagrees with it, has an alternative, or isn't sure what it means says so, the way it would to a colleague. It doesn't need to make a case first. This matters most in unattended sessions, where the maintainer isn't there to correct course along the way.

- **Push back** with a `🤖 Claude question:` where the comment was (its thread, or the PR or issue), and add `needs-decision`. Hold only that point: finish the rest of the work, then stop.
- **As many rounds as it takes.** The exchange ends when the maintainer states the same position in two comments in a row, with only the session's pushback between them. Then the session does what it says, without another question.
- **Waiting for an answer** means waiting for a maintainer comment that answers a `🤖 Claude question:`: after it on the PR or issue, after it in its thread, or in the thread of a finding it links. One comment can come after several questions and answer only some of them, so judge each question by what the comment says. The first session that finds an answer acts on it (or pushes back).
- **Removing `needs-decision`:** only when every `🤖 Claude question:` on that PR or issue, including those in threads, has a maintainer answer: `gh pr edit <n> --remove-label needs-decision`, or `gh issue edit`. Otherwise leave the label, and name the questions still open in the session's summary or reply.

## Findings

The reviewer tags each finding **[blocking]**, **[should fix]**, or **[nit]**, and **confirmed** (traced in the code) or **suspected**. Two markers can go with the tag:

- **[defect]**: the code is wrong, not just open to improvement.
- **[decision]**: only the maintainer can settle it. The reviewer also posts a `🤖 Claude question:` and adds `needs-decision`.

## Answers

The author starts each reply with one answer tag:

| Answer | The reply gives | Next round, the reviewer |
|---|---|---|
| **[fixed]** | the commit, and the test that proves it where one applies | traces the fix and resolves the thread, or raises a new finding |
| **[won't fix]** | the reason. "Outside this issue's scope" is a reason, and nothing is filed for it. | accepts it and resolves the thread, or escalates it as [decision]. It never argues a second round. |
| **[deferred] #N** | the issue that will fix it: an existing one, or a new `fix` issue the author files with the reviewer's reproduction and a link to the finding | checks that the issue exists and covers the finding, and resolves the thread |
| **[decision]** | a link to the `🤖 Claude question:` | leaves the thread open until the maintainer answers |

Which answers a finding allows:

- **[blocking]:** fixed or decision.
- **[should fix]:** fixed, deferred, or decision. Won't fix only with a reason the reviewer accepts.
- **[nit]:** any answer.
- **[defect]**, whatever its tag: never won't fix. Fix it in the PR when it's in code the PR adds or changes, or the PR causes it, and the fix is small. Otherwise defer it to a `fix` issue, filing one if none exists. If the author can't tell which applies, or the fix needs a choice the maintainer should make, it's a [decision].

## Verdict

"Ready to merge" only when every finding has an answer the reviewer accepted and no [blocking] or [decision] is open. A script treats a PR as ready only when all of these hold:

- the latest `🤖 Claude review:` says "ready to merge"
- that review's `commit_id` is the PR's head commit (the SHA in the verdict line is for people)
- CI is green at that commit
- no review thread is unresolved
- neither the PR nor its issue has `needs-decision`

## When a session stops and asks

With a `🤖 Claude question:`, when:

- the work needs a new ADR, or changes an accepted one
- it would go beyond the issue's scope, or a scope point is unclear or contradicts another. Declining or deferring a finding isn't going beyond scope.
- the issue and the guides don't settle a choice between designs
- a coding-rule exception needs more than a one-line reason in the disable comment
- it can't tell what documentation a maintainer would need
- it disagrees with a maintainer comment, or needs one clarified (see "The maintainer's comments")
