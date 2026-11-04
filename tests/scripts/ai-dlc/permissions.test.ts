// Checks the driver's allow and deny lists against the commands they must
// allow or refuse. `ruleMatches` follows Claude Code's documented wildcard rule
// for Bash permissions: `*` matches any characters, anywhere in the pattern,
// and a rule must match the whole command. A deny rule wins over an allow rule.
import { describe, expect, it } from "vitest";
import type { Permissions } from "../../../scripts/ai-dlc/permissions.js";
import {
  addressPermissions,
  reviewPermissions,
  startPermissions,
} from "../../../scripts/ai-dlc/permissions.js";

const escapeRegex = (text: string) =>
  text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

const ruleMatches = (rule: string, command: string) => {
  const pattern = /^Bash\((.*)\)$/.exec(rule)?.[1];
  if (pattern === undefined) return false;
  const regex = new RegExp(
    `^${pattern.split("*").map(escapeRegex).join(".*")}$`,
    "s",
  );
  return regex.test(command);
};

const allows = (permissions: Permissions, command: string) =>
  permissions.allowed.some((rule) => ruleMatches(rule, command)) &&
  !permissions.denied.some((rule) => ruleMatches(rule, command));

const WORKTREE = { relative: "../wind-tunnel-address-5", absolute: "/x" };

describe("the start step's permissions", () => {
  // Fails if the author can't push its issue branch, so no PR is ever opened.
  it.each([
    "git push -u origin feat/issue-12-composition-root",
    "git push origin chore/issue-127-sdlc-loop",
  ])("allow pushing an issue branch: %s", (command) => {
    expect(allows(startPermissions(), command)).toBe(true);
  });

  // Fails if a session that forgot to branch can push `main` straight to origin.
  it.each([
    "git push",
    "git push -u origin main",
    "git push origin main",
    "git push origin HEAD",
    "git push -u origin feat/issue-12-x:main",
    "git push origin HEAD:main",
    "git push origin feat/issue-12-x:refs/heads/main",
  ])("refuse a push that could reach main: %s", (command) => {
    expect(allows(startPermissions(), command)).toBe(false);
  });
});

describe("every session's permissions", () => {
  // Fails if `gh api` on pull requests lets a session merge around `gh pr merge`.
  it.each([
    ["start", startPermissions()],
    ["review", reviewPermissions()],
    ["address", addressPermissions(WORKTREE)],
  ])("refuse a merge through the API (%s)", (_step, permissions) => {
    expect(
      allows(
        permissions,
        "gh api repos/{owner}/{repo}/pulls/5/merge --method PUT",
      ),
    ).toBe(false);
  });

  // Fails if the merge rule also blocks a review reply, which goes through the same API.
  it("still allow a reply in a review thread", () => {
    expect(
      allows(
        reviewPermissions(),
        "gh api repos/{owner}/{repo}/pulls/5/comments/9/replies --method POST -f body=ready to merge",
      ),
    ).toBe(true);
  });
});
