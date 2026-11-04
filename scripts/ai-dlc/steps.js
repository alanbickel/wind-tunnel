// The steps for one issue: start, CI, review, address, and merge.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  checkRunsAt,
  ciGreenAt,
  latestClaudeReview,
  needsDecision,
  openPrFor,
  openPrNumbers,
  readIssue,
  readPr,
  unresolvedThreads,
} from "./github.js";
import {
  addressPermissions,
  reviewPermissions,
  startPermissions,
} from "./permissions.js";
import { REVIEWER_DEFERRAL, authorPrompt } from "./prompts.js";
import { askMaintainer, stopIfWaiting } from "./questions.js";
import { LOG_DIR, runSession } from "./session.js";
import { pause, read, run, watch } from "./shell.js";
import { fail } from "./stop.js";

const MAX_REVIEW_ROUNDS = 3;
const CI_REGISTER_TIMEOUT_MS = 10 * 60 * 1000;
const CI_POLL_INTERVAL_MS = 15 * 1000;

/** @typedef {{ merge: boolean, deferManualChecks: boolean }} Options */
/** @typedef {{ issue: number, options: Options }} Job */
/** @typedef {import("./github.js").PullRequest} PullRequest */

/** The step that ran last, so a dirty working tree can be blamed on it. */
const progress = { lastStep: "an earlier run, or by hand" };

/**
 * Stops unless the working tree is clean, then puts the checkout on an up-to-date `main`.
 * The driver's own logs don't count, even where `main`'s .gitignore doesn't list them yet.
 */
function prepareCheckout() {
  const changes = read("git", [
    "status",
    "--porcelain",
    "--",
    ".",
    `:(exclude)${LOG_DIR}`,
  ]).trim();
  if (changes) {
    throw fail(
      `The working tree isn't clean. It was left that way by ${progress.lastStep}:\n${changes}`,
    );
  }
  run("git", ["switch", "main"]);
  run("git", ["fetch", "origin"]);
  run("git", ["merge", "--ff-only", "origin/main"]);
}

/** Runs the author session, which opens the issue's one PR, and returns its number. */
export async function startIssue(/** @type {Job} */ job) {
  prepareCheckout();
  const before = new Set(openPrNumbers());
  const name = `${job.issue}-start`;
  progress.lastStep = name;
  await runSession({
    name,
    prompt: authorPrompt(job.issue, job.options),
    permissions: startPermissions(),
    systemPromptAddition: undefined,
  });
  const opened = openPrNumbers().filter((number) => !before.has(number));
  stopIfWaiting(job.issue, opened.length === 1 ? opened[0] : undefined);
  if (opened.length !== 1) {
    throw fail(
      `${name} opened ${opened.length} PRs (${opened.join(", ") || "none"}); expected one.`,
    );
  }
  if (openPrFor(job.issue)?.number !== opened[0]) {
    throw fail(
      `${name} opened PR #${opened[0]}, but its description doesn't close #${job.issue}.`,
    );
  }
  return opened[0];
}

/** Waits for the head commit's checks to appear, watches them, and stops unless they pass. */
function waitForCi(/** @type {number} */ prNumber) {
  const { headRefOid } = readPr(prNumber);
  const deadline = Date.now() + CI_REGISTER_TIMEOUT_MS;
  while (checkRunsAt(headRefOid).length === 0) {
    if (Date.now() > deadline)
      throw fail(`No CI checks appeared for ${headRefOid} on PR #${prNumber}.`);
    pause(CI_POLL_INTERVAL_MS);
  }
  console.log(
    `\nWaiting for CI on PR #${prNumber} at ${headRefOid.slice(0, 7)}`,
  );
  watch("gh", ["pr", "checks", String(prNumber), "--watch", "--fail-fast"]);
  if (!ciGreenAt(headRefOid))
    throw fail(`CI failed on PR #${prNumber} at ${headRefOid}.`);
}

/** Runs `/pr-review` in a fresh session and returns the review it posted. */
async function review(
  /** @type {Job} */ job,
  /** @type {{ pr: number, round: number }} */ at,
) {
  prepareCheckout();
  const before = latestClaudeReview(readPr(at.pr))?.submittedAt;
  const name = `${job.issue}-review-${at.pr}-${at.round}`;
  progress.lastStep = name;
  await runSession({
    name,
    prompt: `/pr-review ${at.pr}`,
    permissions: reviewPermissions(),
    systemPromptAddition: job.options.deferManualChecks
      ? REVIEWER_DEFERRAL
      : undefined,
  });
  stopIfWaiting(job.issue, at.pr);
  const posted = latestClaudeReview(readPr(at.pr));
  if (!posted || posted.submittedAt === before)
    throw fail(`${name} posted no review.`);
  if (!posted.verdict)
    throw fail(`${name} posted a review without a readable verdict line.`);
  return posted;
}

/** Runs `/pr-address` in a fresh session, in a worktree the driver creates first. */
async function address(
  /** @type {Job} */ job,
  /** @type {{ pr: number, round: number }} */ at,
) {
  prepareCheckout();
  const worktree = addressWorktree(at.pr);
  const name = `${job.issue}-address-${at.pr}-${at.round}`;
  progress.lastStep = name;
  await runSession({
    name,
    prompt: `/pr-address ${at.pr}`,
    permissions: addressPermissions(worktree),
    systemPromptAddition: undefined,
  });
  removeWorktreeIfClean({ worktree, step: name });
  stopIfWaiting(job.issue, at.pr);
}

/** A session can be given only a folder that exists when it starts (#126), so create it now. */
function addressWorktree(/** @type {number} */ prNumber) {
  const relative = `../wind-tunnel-address-${prNumber}`;
  const absolute = resolve(relative);
  run("git", ["worktree", "prune"]);
  if (!existsSync(absolute))
    run("git", ["worktree", "add", relative, readPr(prNumber).headRefName]);
  return { relative, absolute };
}

/** `/pr-address` removes its worktree when it's done. One left with changes is unsaved work. */
function removeWorktreeIfClean(
  /** @type {{ worktree: { relative: string, absolute: string }, step: string }} */ after,
) {
  if (!existsSync(after.worktree.absolute)) return;
  const changes = read("git", [
    "-C",
    after.worktree.absolute,
    "status",
    "--porcelain",
  ]).trim();
  if (changes)
    throw fail(
      `${after.step} left changes in ${after.worktree.absolute}:\n${changes}`,
    );
  run("git", ["worktree", "remove", after.worktree.relative]);
}

/** Where to pick up: a review at the head commit has been read already, so act on its verdict. */
function nextStep(/** @type {PullRequest} */ pr) {
  const latest = latestClaudeReview(pr);
  if (latest?.commitId !== pr.headRefOid) return "review";
  if (!latest.verdict)
    throw fail(
      `The latest review of PR #${pr.number} has no readable verdict line.`,
    );
  return latest.verdict === "ready to merge" ? "ready" : "address";
}

/** Reviews and addresses until the verdict is "ready to merge", or stops to ask. */
export async function reviewUntilReady(
  /** @type {Job} */ job,
  /** @type {number} */ pr,
) {
  let next = nextStep(readPr(pr));
  for (let round = 1; next !== "ready"; round++) {
    if (next === "address") await address(job, { pr, round });
    waitForCi(pr);
    const { verdict, commitId } = await review(job, { pr, round });
    if (verdict === "ready to merge") return;
    if (verdict === "needs rework")
      askMaintainer({ issue: job.issue, pr }, needsReworkQuestion(commitId));
    if (round === MAX_REVIEW_ROUNDS)
      askMaintainer({ issue: job.issue, pr }, tooManyRoundsQuestion(commitId));
    next = "address";
  }
}

function needsReworkQuestion(/** @type {string} */ commitId) {
  return `The review at ${commitId.slice(0, 7)} says "needs rework", so the driver stopped rather than answer it.

Options:
1. Comment here with the direction the rework should take, then run the driver again. It picks up with \`/pr-address\`, which reads your comment.
2. Take the PR over yourself, or close it.

I recommend reading the review first: whether option 1 can work depends on how far off the PR is.`;
}

function tooManyRoundsQuestion(/** @type {string} */ commitId) {
  return `The review at ${commitId.slice(0, 7)} still says "merge after fixes" after ${MAX_REVIEW_ROUNDS} rounds, so the driver stopped: another \`/pr-address\` would push fixes no review would read.

Options:
1. Settle the open findings in their threads, then run the driver again. It picks up with \`/pr-address\`.
2. Comment here to allow more rounds, then run the driver again: it gives the PR up to ${MAX_REVIEW_ROUNDS} more.
3. Take the PR over yourself.

I recommend option 1 if the open threads go back and forth on the same point, and option 2 if each round found something new.`;
}

/** Squash-merges the PR only when the protocol's "ready to merge, for a script" conditions all hold. */
export function mergeWhenReady(
  /** @type {Job} */ job,
  /** @type {number} */ prNumber,
) {
  const pr = readPr(prNumber);
  const unmet = unmetMergeConditions(pr, job.issue);
  if (unmet.length > 0)
    throw fail(
      `PR #${prNumber} isn't ready to merge:\n- ${unmet.join("\n- ")}`,
    );
  run("gh", [
    "pr",
    "merge",
    String(prNumber),
    "--squash",
    "--match-head-commit",
    pr.headRefOid,
    "--subject",
    `${pr.title} (#${prNumber})`,
  ]);
  console.log(`\nMerged PR #${prNumber}: ${pr.url}`);
}

function unmetMergeConditions(
  /** @type {PullRequest} */ pr,
  /** @type {number} */ issue,
) {
  const latest = latestClaudeReview(pr);
  const unresolved = unresolvedThreads(pr.number).length;
  const conditions = [
    [
      latest?.verdict === "ready to merge",
      `the latest review says "${latest?.verdict ?? "nothing"}"`,
    ],
    [
      latest?.commitId === pr.headRefOid,
      `the latest review isn't at the head commit ${pr.headRefOid.slice(0, 7)}`,
    ],
    [ciGreenAt(pr.headRefOid), "CI isn't green at the head commit"],
    [unresolved === 0, `${unresolved} review threads are unresolved`],
    [
      !needsDecision(pr) && !needsDecision(readIssue(issue)),
      "the PR or its issue still has needs-decision",
    ],
  ];
  return conditions
    .filter(([holds]) => !holds)
    .map(([, reason]) => String(reason));
}
