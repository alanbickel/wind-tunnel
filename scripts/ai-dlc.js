// Drives a list of issues through PR, review, and merge, each step in its own
// fresh headless Claude session. AI-DLC.md says how to
// run it, resume it, and what to read afterward.
//   node scripts/ai-dlc.js <issue>... [--merge] [--defer-manual-checks]
// Exit codes: 0 done, 1 something failed, 2 waiting for the maintainer's answer.
import { parseArguments } from "./ai-dlc/arguments.js";
import { collectDeferredChecks } from "./ai-dlc/deferred-checks.js";
import { openPrFor, readIssue } from "./ai-dlc/github.js";
import { stopIfWaiting } from "./ai-dlc/questions.js";
import {
  mergeWhenReady,
  reviewUntilReady,
  startIssue,
} from "./ai-dlc/steps.js";
import { NEEDS_DECISION, Stop } from "./ai-dlc/stop.js";

const BELL = "\u0007";

/** @typedef {import("./ai-dlc/arguments.js").RunFlags} RunFlags */

/**
 * Takes one issue as far as it can go. Returns true when it's finished (closed,
 * or merged now), and false when it's ready but left for the maintainer to merge:
 * the issues after it may build on it, so the run doesn't skip ahead.
 */
async function driveIssue(
  /** @type {number} */ issue,
  /** @type {RunFlags} */ flags,
) {
  const { state, title } = readIssue(issue);
  console.log(
    `\n${"=".repeat(72)}\n#${issue} ${title} (${state.toLowerCase()})`,
  );
  if (state === "CLOSED") return true;
  const job = { issue, flags };
  const existing = openPrFor(issue)?.number;
  stopIfWaiting(issue, existing);
  const pr = existing ?? (await startIssue(job));
  await reviewUntilReady(job, pr);
  if (!flags.merge) {
    console.log(
      `\nPR #${pr} is ready to merge. Merge it, or run again with --merge, to go on.`,
    );
    return false;
  }
  mergeWhenReady(job, pr);
  return true;
}

async function main() {
  const { issues, flags } = parseArguments(process.argv.slice(2));
  for (const issue of issues) {
    if (!(await driveIssue(issue, flags))) return;
  }
  if (flags.deferManualChecks) collectDeferredChecks(issues);
  console.log("\nEvery issue in the list is done.");
}

try {
  await main();
} catch (error) {
  if (!(error instanceof Stop)) throw error;
  console.error(`\n${error.message}`);
  if (error.code === NEEDS_DECISION) process.stderr.write(BELL);
  process.exitCode = error.code;
}
