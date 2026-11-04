// What the driver tells each session. `/pr-review` and `/pr-address` are
// project commands with their own instructions; the start step has only this.

/** @typedef {import("./arguments.js").RunFlags} RunFlags */

/** The start step's prompt: work one issue and open its PR. */
export function authorPrompt(
  /** @type {number} */ issue,
  /** @type {RunFlags} */ flags,
) {
  const paragraphs = [
    `You're the author of issue #${issue} on Wind Tunnel, running headless: a driver script started this session, no one can answer a prompt, and the driver reads what you leave on GitHub. The driver chose the issue, so don't pick one from the Roadmap. Otherwise work as CLAUDE.md says.`,
    `1. Read \`.claude/review-protocol.md\` first, and follow it. It says when to stop and ask (a \`🤖 Claude question:\` comment on the issue, then the \`needs-decision\` label, then stop), how to act on the maintainer's answers, and how to record the choices you make without asking, documentation included, in a \`🤖 Claude decisions:\` comment on the issue.`,
    `2. Read the issue with its comments: \`gh issue view ${issue} --comments\`. If a maintainer comment answers an earlier question, act on it as the protocol says. If a branch for this issue already exists on origin (\`git ls-remote --heads origin\`), an earlier session started it: switch to it and carry on.`,
    `3. Follow CONTRIBUTING's "Branches and pull requests": branch from \`main\`, commit, run \`npm run check\` until it passes, push, and open exactly one PR, with \`Closes #${issue}\` in its description. Don't review or merge it: the driver runs \`/pr-review\` in a fresh session next.`,
    `4. Leave the working tree clean when you stop, whether you opened the PR or stopped to ask: commit and push what you have, or change nothing. The driver stops if it finds uncommitted changes.`,
    SHELL_RULES,
  ];
  if (flags.deferManualChecks) paragraphs.push(authorDeferral(issue));
  return paragraphs.join("\n\n");
}

const SHELL_RULES = `Shell commands: a command the allow list doesn't match is refused, and no one can approve it. Run one command per call. Don't \`cd\`, use shell variables, \`$TEMP\`, output redirection to a file, or heredocs. Write paths out in full. Commit with \`git commit -m "<one line>"\`. Push with \`git push -u origin <branch>\`, naming the issue branch: a bare \`git push\` is refused, and so is any push to \`main\`. Write a comment's body to a file in \`.review-tmp/\` (gitignored) and pass it with \`--body-file\`. Change files with the Edit and Write tools, not scripts.`;

function authorDeferral(/** @type {number} */ issue) {
  return `This run defers manual checks (\`--defer-manual-checks\`, an exception for this experiment only; CONTRIBUTING's rule doesn't change). Don't try a "Done when" check that needs a person, such as one in a browser. List each in one comment on issue #${issue} that starts with \`🤖 Claude deferred checks:\`, as a Markdown checklist (\`- [ ] ...\`), one item per check saying what to do and what should happen. The rest of "Done when" still applies.`;
}

/** Added to `/pr-review`'s system prompt when manual checks are deferred. */
export const REVIEWER_DEFERRAL = `This run defers manual checks (\`--defer-manual-checks\`, an exception for this experiment only). Count a "Done when" check that needs a person, such as one in a browser, as met if it's listed in a \`🤖 Claude deferred checks:\` comment on the issue. A check that needs a person and isn't listed there is a finding.`;
