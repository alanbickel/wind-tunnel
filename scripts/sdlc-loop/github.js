// What the driver reads from GitHub. GitHub is the only state the steps share.
import { fileURLToPath } from "node:url";
import { ghJson, read } from "./shell.js";

export const NEEDS_DECISION_LABEL = "needs-decision";
const REVIEW_PREFIX = "🤖 Claude review:";
const VERDICT_LINE =
  /^🤖 Claude review: Verdict: (ready to merge|merge after fixes|needs rework) at /;
const GREEN_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);
const REVIEW_THREADS_SCRIPT = fileURLToPath(
  new URL("../review-threads.js", import.meta.url),
);

/** @typedef {{ body: string, createdAt: string, url: string }} Comment */
/** @typedef {{ number: number, title: string, state: string, labels: string[], comments: Comment[], parent: number | undefined }} Issue */
/** @typedef {{ verdict: string | undefined, commitId: string, submittedAt: string }} ClaudeReview */
/** @typedef {{ body: string, submittedAt: string, commit: { oid: string } }} Review */
/** @typedef {{ number: number, title: string, url: string, headRefName: string, headRefOid: string, labels: string[], comments: Comment[], reviews: Review[] }} PullRequest */
/** @typedef {{ name: string, status: string, conclusion: string | null }} CheckRun */

/** Reads an issue with its labels and comments. */
export function readIssue(/** @type {number} */ number) {
  const issue = ghJson([
    "issue",
    "view",
    String(number),
    "--json",
    "number,title,state,labels,comments,parent",
  ]);
  return /** @type {Issue} */ ({
    ...issue,
    labels: labelNames(issue.labels),
    parent: issue.parent?.number,
  });
}

/** Numbers of every open PR. */
export function openPrNumbers() {
  const prs = ghJson([
    "pr",
    "list",
    "--state",
    "open",
    "--limit",
    "200",
    "--json",
    "number",
  ]);
  return prs.map((/** @type {{ number: number }} */ pr) => pr.number);
}

/** The open PR that closes the issue, if there is one. */
export function openPrFor(/** @type {number} */ issue) {
  const prs = ghJson([
    "pr",
    "list",
    "--state",
    "open",
    "--limit",
    "200",
    "--json",
    "number,closingIssuesReferences",
  ]);
  const match = prs.find((/** @type {any} */ pr) =>
    pr.closingIssuesReferences.some(
      (/** @type {any} */ ref) => ref.number === issue,
    ),
  );
  return match ? readPr(match.number) : undefined;
}

/** Reads a PR with its head, labels, comments, and reviews. */
export function readPr(/** @type {number} */ number) {
  const pr = ghJson([
    "pr",
    "view",
    String(number),
    "--json",
    "number,title,url,headRefName,headRefOid,labels,comments,reviews",
  ]);
  return /** @type {PullRequest} */ ({ ...pr, labels: labelNames(pr.labels) });
}

/** A PR's inline review comments, as comments. */
export function reviewComments(/** @type {number} */ pr) {
  const pages = ghJson([
    "api",
    `repos/{owner}/{repo}/pulls/${pr}/comments`,
    "--paginate",
    "--slurp",
  ]);
  return pages.flat().map((/** @type {any} */ comment) => ({
    body: comment.body,
    createdAt: comment.created_at,
    url: comment.html_url,
  }));
}

/** Every comment on the issue and its PR, review summaries and inline comments included. */
export function allComments(
  /** @type {Issue} */ issue,
  /** @type {PullRequest | undefined} */ pr,
) {
  if (!pr) return issue.comments;
  const reviews = pr.reviews.map((review) => ({
    body: review.body,
    createdAt: review.submittedAt,
    url: pr.url,
  }));
  return [
    ...issue.comments,
    ...pr.comments,
    ...reviews,
    ...reviewComments(pr.number),
  ];
}

/** The PR's latest `🤖 Claude review:`, with the verdict read from its first line. */
export function latestClaudeReview(/** @type {PullRequest} */ pr) {
  const review = pr.reviews
    .filter((each) => each.body.startsWith(REVIEW_PREFIX))
    .at(-1);
  if (!review) return undefined;
  return /** @type {ClaudeReview} */ ({
    verdict: VERDICT_LINE.exec(review.body)?.[1],
    commitId: review.commit.oid,
    submittedAt: review.submittedAt,
  });
}

/** The check runs GitHub has registered for a commit. */
export function checkRunsAt(/** @type {string} */ sha) {
  const pages = ghJson([
    "api",
    `repos/{owner}/{repo}/commits/${sha}/check-runs`,
    "--paginate",
    "--slurp",
  ]);
  return /** @type {CheckRun[]} */ (
    pages.flatMap((/** @type {any} */ page) => page.check_runs)
  );
}

/** True when the commit has checks and every one finished green. */
export function ciGreenAt(/** @type {string} */ sha) {
  const runs = checkRunsAt(sha);
  return (
    runs.length > 0 &&
    runs.every(
      (each) =>
        each.status === "completed" &&
        GREEN_CONCLUSIONS.has(each.conclusion ?? ""),
    )
  );
}

/** The PR's review threads that aren't resolved. */
export function unresolvedThreads(/** @type {number} */ pr) {
  const threads = JSON.parse(
    read("node", [REVIEW_THREADS_SCRIPT, "list", String(pr)]),
  );
  return threads.filter(
    (/** @type {{ isResolved: boolean }} */ thread) => !thread.isResolved,
  );
}

/** True when the issue or PR carries `needs-decision`. */
export function needsDecision(/** @type {{ labels: string[] }} */ item) {
  return item.labels.includes(NEEDS_DECISION_LABEL);
}

function labelNames(/** @type {{ name: string }[]} */ labels) {
  return labels.map((label) => label.name);
}
