// The question route (.claude/review-protocol.md): when a session waits on the
// maintainer, and the questions the driver asks itself.
import {
  NEEDS_DECISION_LABEL,
  allComments,
  needsDecision,
  readIssue,
  readPr,
} from "./github.js";
import { run } from "./shell.js";
import { NEEDS_DECISION, Stop } from "./stop.js";

const QUESTION_PREFIX = "🤖 Claude question:";
const CLAUDE_PREFIX = "🤖";

/** @typedef {import("./github.js").Comment} Comment */

/**
 * Stops the run (exit code 2) when the issue or its PR has `needs-decision`
 * and no maintainer comment is newer than the newest question. Sessions take
 * the label off once they act on an answer, so the label alone isn't the
 * signal: a maintainer comment after the question is.
 */
export function stopIfWaiting(
  /** @type {number} */ issueNumber,
  /** @type {number | undefined} */ prNumber,
) {
  const issue = readIssue(issueNumber);
  const pr = prNumber === undefined ? undefined : readPr(prNumber);
  if (!needsDecision(issue) && !(pr && needsDecision(pr))) return;
  const comments = allComments(issue, pr);
  const question = newest(comments.filter(isQuestion));
  const answer = newest(comments.filter(isMaintainers));
  if (question && answer && answer.createdAt > question.createdAt) {
    console.log(
      `\nThe maintainer answered at ${answer.createdAt}: ${answer.url}. Resuming.`,
    );
    return;
  }
  const where =
    pr && needsDecision(pr) ? `PR #${pr.number}` : `issue #${issue.number}`;
  throw new Stop(NEEDS_DECISION, questionBanner(where, question));
}

/** Posts the driver's own question on the PR, labels it, and stops the run. */
export function askMaintainer(
  /** @type {{ issue: number, pr: number }} */ target,
  /** @type {string} */ question,
) {
  const body = `${QUESTION_PREFIX} ${question}`;
  run("gh", ["pr", "comment", String(target.pr), "--body", body]);
  run("gh", [
    "pr",
    "edit",
    String(target.pr),
    "--add-label",
    NEEDS_DECISION_LABEL,
  ]);
  stopIfWaiting(target.issue, target.pr);
  throw new Stop(
    NEEDS_DECISION,
    `PR #${target.pr} has a question from the driver.`,
  );
}

function questionBanner(
  /** @type {string} */ where,
  /** @type {Comment | undefined} */ question,
) {
  const rule = "=".repeat(72);
  const text = question
    ? `${question.body}\n\n${question.url}`
    : `${where} has ${NEEDS_DECISION_LABEL}, but no "${QUESTION_PREFIX}" comment was found.`;
  return [
    rule,
    `${where} is waiting for the maintainer.`,
    rule,
    text,
    rule,
    "Answer on GitHub, then run the same command again.",
  ].join("\n");
}

function isQuestion(/** @type {Comment} */ comment) {
  return comment.body.trimStart().startsWith(QUESTION_PREFIX);
}

/** A maintainer comment has no `🤖` prefix. Empty bodies are review shells around inline replies. */
function isMaintainers(/** @type {Comment} */ comment) {
  const body = comment.body.trim();
  return body !== "" && !body.startsWith(CLAUDE_PREFIX);
}

function newest(/** @type {Comment[]} */ comments) {
  return comments
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
}
