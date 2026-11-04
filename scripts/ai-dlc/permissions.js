// The tools each headless session may use, passed with --allowedTools and
// --disallowedTools so a fresh clone needs no local settings. The review and
// address lists are the ones #126 found the commands need
// (https://github.com/alanbickel/wind-tunnel/issues/124#issuecomment-6628317102).
// A session can't approve a prompt, so anything not allowed is refused.

/** What every session needs: read GitHub and git, post comments, and write scratch files. */
const COMMON = [
  "Bash(gh pr view *)",
  "Bash(gh pr diff *)",
  "Bash(gh pr checks *)",
  "Bash(gh pr comment *)",
  "Bash(gh pr edit *)",
  "Bash(gh issue view *)",
  "Bash(gh issue list *)",
  "Bash(gh issue create *)",
  "Bash(gh issue comment *)",
  "Bash(gh issue edit *)",
  "Bash(gh api repos/{owner}/{repo}/pulls/*)",
  "Bash(node scripts/review-threads.js *)",
  "Bash(git fetch *)",
  "Bash(git log *)",
  "Bash(git show *)",
  "Bash(git diff *)",
  "Bash(git grep *)",
  "Bash(git merge-base *)",
  "Bash(git ls-remote *)",
  "Bash(git worktree add *)",
  "Bash(git worktree remove *)",
  "Bash(git worktree prune)",
  "Bash(git worktree list)",
  "Edit(/.review-tmp/**)",
];

/** CONTRIBUTING's branch names start with the issue's type label: `feat/issue-12-...`. */
const BRANCH_TYPES = ["feat", "fix", "refactor", "test", "docs", "chore"];

/**
 * The author pushes only branches named for an issue. A bare `git push` would
 * push `main` if the session forgot to branch, so it isn't allowed.
 */
const ISSUE_BRANCH_PUSHES = BRANCH_TYPES.flatMap((type) => [
  `Bash(git push origin ${type}/issue-*)`,
  `Bash(git push -u origin ${type}/issue-*)`,
]);

/** The author works in the driver's checkout: branch, change, check, commit, push, open the PR. */
const START = [
  ...COMMON,
  "Bash(git status*)",
  "Bash(git switch -c *)",
  "Bash(git switch *)",
  "Bash(git add *)",
  "Bash(git rm *)",
  "Bash(git mv *)",
  "Bash(git commit -m *)",
  ...ISSUE_BRANCH_PUSHES,
  "Bash(git merge origin/main)",
  "Bash(gh pr create *)",
  "Bash(gh pr list *)",
  "Bash(gh label list*)",
  "Bash(npm ci)",
  "Bash(npm run *)",
  "Bash(npx vitest *)",
  "Bash(npx tsc *)",
  "Bash(npx prettier *)",
  "Bash(npx eslint *)",
];

/** `/pr-address` works in its own worktree. Keep the `git -C` rules narrow: see DENY. */
function addressTools(/** @type {string} */ worktree) {
  const git = `git -C ${worktree}`;
  return [
    ...COMMON,
    "Bash(npm --prefix *)",
    `Bash(${git} merge --ff-only *)`,
    `Bash(${git} merge origin/main)`,
    `Bash(${git} add *)`,
    `Bash(${git} commit -m *)`,
    `Bash(${git} push)`,
    `Bash(${git} status*)`,
    `Bash(${git} diff*)`,
    `Bash(${git} log*)`,
  ];
}

/**
 * Never: force-push, rebase, amend, push to main, merge a PR, or point gh at
 * another repository. The `git -C` forms are here because a pattern like
 * `git push --force*` doesn't match `git -C <dir> push --force`. A merge
 * through the API (`gh api .../pulls/<n>/merge`) is denied too, because
 * COMMON allows `gh api` on pull requests.
 */
const DENY = [
  "Bash(gh repo edit *)",
  "Bash(gh pr merge*)",
  "Bash(gh api *pulls/*/merge*)",
  "Bash(gh issue* -R*)",
  "Bash(gh issue* --repo*)",
  "Bash(gh pr* -R*)",
  "Bash(gh pr* --repo*)",
  "Bash(GH_REPO=*)",
  "Bash(git push * main)",
  "Bash(git push * main *)",
  "Bash(git push * *:main*)",
  "Bash(git push * *:refs/heads/main*)",
  "Bash(git push --force*)",
  "Bash(git push * --force*)",
  "Bash(git push -f*)",
  "Bash(git push * -f*)",
  "Bash(git rebase *)",
  "Bash(git commit --amend*)",
  "Bash(git commit * --amend*)",
  "Bash(git -C * push*--force*)",
  "Bash(git -C * push*-f*)",
  "Bash(git -C * push*main*)",
  "Bash(git -C * rebase*)",
  "Bash(git -C * commit*--amend*)",
];

/** @typedef {{ allowed: string[], denied: string[], permissionMode: string | undefined, extraDirectory: string | undefined }} Permissions */
/** @typedef {{ relative: string, absolute: string }} AddressWorktree */

/** The start step's permissions: edits in the checkout are accepted. */
export function startPermissions() {
  return /** @type {Permissions} */ ({
    allowed: START,
    denied: DENY,
    permissionMode: "acceptEdits",
    extraDirectory: undefined,
  });
}

/** `/pr-review` reads and posts; it never edits code. */
export function reviewPermissions() {
  return /** @type {Permissions} */ ({
    allowed: COMMON,
    denied: DENY,
    permissionMode: undefined,
    extraDirectory: undefined,
  });
}

/** `/pr-address` edits in its worktree, which must exist before the session starts. */
export function addressPermissions(/** @type {AddressWorktree} */ worktree) {
  return /** @type {Permissions} */ ({
    allowed: addressTools(worktree.relative),
    denied: DENY,
    permissionMode: "acceptEdits",
    extraDirectory: worktree.absolute,
  });
}
