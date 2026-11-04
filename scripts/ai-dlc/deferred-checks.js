// With --defer-manual-checks, authors list the manual "Done when" checks they
// skipped on each issue. At the end of the run, the driver gathers them into
// one checklist on each parent issue, so the maintainer runs them in one pass.
import { readIssue } from "./github.js";
import { run } from "./shell.js";

const PREFIX = "🤖 Claude deferred checks:";
const CHECKLIST_ITEM = /^\s*- \[[ xX]\] /;

/** @typedef {import("./github.js").Issue} Issue */
/** @typedef {{ issue: Issue, items: string[] }} Section */

/** Posts each parent issue's checklist, unless the same one is already there. */
export function collectDeferredChecks(/** @type {number[]} */ issues) {
  for (const [parent, sections] of sectionsByParent(issues)) {
    const body = checklistComment(sections);
    if (readIssue(parent).comments.some((comment) => comment.body === body))
      continue;
    run("gh", ["issue", "comment", String(parent), "--body", body]);
    console.log(`\nCollected the deferred checks on #${parent}.`);
  }
}

function sectionsByParent(/** @type {number[]} */ issues) {
  /** @type {Map<number, Section[]>} */
  const byParent = new Map();
  for (const issue of issues.map(readIssue)) {
    const items = deferredItems(issue);
    if (items.length === 0) continue;
    if (issue.parent === undefined) {
      console.log(
        `\n#${issue.number} has deferred checks but no parent issue; they stay on #${issue.number}.`,
      );
      continue;
    }
    byParent.set(issue.parent, [
      ...(byParent.get(issue.parent) ?? []),
      { issue, items },
    ]);
  }
  return byParent;
}

/** The checklist items in the issue's deferred-checks comments, each reset to unticked. */
export function deferredItems(/** @type {Issue} */ issue) {
  return issue.comments
    .filter((comment) => comment.body.startsWith(PREFIX))
    .flatMap((comment) => comment.body.split("\n"))
    .filter((line) => CHECKLIST_ITEM.test(line))
    .map((line) => line.trim().replace(CHECKLIST_ITEM, "- [ ] "));
}

function checklistComment(/** @type {Section[]} */ sections) {
  const numbers = sections.map(({ issue }) => `#${issue.number}`).join(", ");
  const parts = sections.map(
    ({ issue, items }) =>
      `### #${issue.number} ${issue.title}\n\n${items.join("\n")}`,
  );
  return [
    `${PREFIX} the manual checks deferred in ${numbers}, collected by the driver.`,
    ...parts,
  ].join("\n\n");
}
