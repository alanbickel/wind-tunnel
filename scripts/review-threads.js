// Lists a PR's review threads, or resolves one, for /pr-review and /pr-address.
//   node scripts/review-threads.js list <pr-number>
//   node scripts/review-threads.js resolve <thread-id>
// Thread ids and resolving exist only in GitHub's GraphQL API. This script runs just
// these two operations, so sessions can be allowed it without `gh api graphql` in general.
import { execFileSync } from "node:child_process";

const LIST_QUERY = `
query ($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          id
          isResolved
          path
          line
          originalLine
          comments(first: 50) {
            pageInfo { hasNextPage }
            nodes { databaseId author { login } body }
          }
        }
      }
    }
  }
}`;

const RESOLVE_MUTATION = `
mutation ($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } }
}`;

/** Runs `gh` with the given arguments and returns its parsed JSON output. */
function ghJson(/** @type {string[]} */ args) {
  return JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));
}

/** Runs a GraphQL query; each variable is passed with `-F` so numbers stay numbers. */
function graphql(
  /** @type {string} */ query,
  /** @type {Record<string, string | number>} */ variables,
) {
  const fields = Object.entries(variables).flatMap(([key, value]) => [
    "-F",
    `${key}=${value}`,
  ]);
  return ghJson(["api", "graphql", "-f", `query=${query}`, ...fields]);
}

/** Throws if GitHub left out threads or comments past the query's page sizes, so a missing thread never reads as no thread. */
function assertComplete(/** @type {any} */ reviewThreads) {
  const truncated =
    reviewThreads.pageInfo.hasNextPage ||
    reviewThreads.nodes.some(
      (/** @type {any} */ thread) => thread.comments.pageInfo.hasNextPage,
    );
  if (truncated) {
    throw new Error(
      "More than 100 threads, or 50 comments in a thread: the list would be incomplete. Add paging to scripts/review-threads.js.",
    );
  }
}

/** Prints each thread with its comments' REST ids, so a session can match them to `pulls/<n>/comments`. */
function listThreads(/** @type {string} */ prNumber) {
  const repo = ghJson(["repo", "view", "--json", "owner,name"]);
  const result = graphql(LIST_QUERY, {
    owner: repo.owner.login,
    name: repo.name,
    number: Number(prNumber),
  });
  const { reviewThreads } = result.data.repository.pullRequest;
  assertComplete(reviewThreads);
  const threads = reviewThreads.nodes.map((/** @type {any} */ thread) => ({
    id: thread.id,
    isResolved: thread.isResolved,
    path: thread.path,
    line: thread.line ?? thread.originalLine,
    comments: thread.comments.nodes.map((/** @type {any} */ comment) => ({
      id: comment.databaseId,
      author: comment.author?.login,
      firstLine: comment.body.split("\n")[0],
    })),
  }));
  process.stdout.write(`${JSON.stringify(threads, null, 2)}\n`);
}

function resolveThread(/** @type {string} */ threadId) {
  const result = graphql(RESOLVE_MUTATION, { threadId });
  process.stdout.write(
    `${JSON.stringify(result.data.resolveReviewThread.thread)}\n`,
  );
}

const COMMANDS = { list: listThreads, resolve: resolveThread };
const [commandName, argument] = process.argv.slice(2);
const command = Object.hasOwn(COMMANDS, commandName)
  ? COMMANDS[/** @type {keyof typeof COMMANDS} */ (commandName)]
  : undefined;
if (!command || !argument) {
  process.stderr.write(
    "Usage: node scripts/review-threads.js list <pr-number> | resolve <thread-id>\n",
  );
  process.exitCode = 1;
} else {
  command(argument);
}
