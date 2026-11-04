import { describe, expect, it } from "vitest";
import type { PullRequest, Review } from "../../../scripts/ai-dlc/github.js";
import type { MergeFacts } from "../../../scripts/ai-dlc/steps.js";
import {
  nextStep,
  unmetMergeConditions,
} from "../../../scripts/ai-dlc/steps.js";

const HEAD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const OLDER = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const claudeReview = (verdict: string, commit: string): Review => ({
  body: `🤖 Claude review: Verdict: ${verdict} at ${commit.slice(0, 7)}\n\nFindings.`,
  submittedAt: "2026-11-04T10:00:00Z",
  commit: { oid: commit },
});

const pullRequest = (
  reviews: Review[],
  labels: string[] = [],
): PullRequest => ({
  number: 5,
  title: "feat: something",
  url: "https://example.test/pull/5",
  headRefName: "feat/issue-4-something",
  headRefOid: HEAD,
  labels,
  comments: [],
  reviews,
});

describe("nextStep", () => {
  // Fails if an unreviewed PR skips review.
  it("reviews a PR with no review", () => {
    expect(nextStep(pullRequest([]))).toBe("review");
  });

  // Fails if a review of an older commit is taken as a review of the head,
  // so new commits reach the merge check unreviewed.
  it("reviews again when the latest review is of an older commit", () => {
    expect(nextStep(pullRequest([claudeReview("ready to merge", OLDER)]))).toBe(
      "review",
    );
  });

  // Fails if a ready review of the head commit is reviewed again, wasting a round.
  it("goes to the merge check when the head commit's review is ready", () => {
    expect(nextStep(pullRequest([claudeReview("ready to merge", HEAD)]))).toBe(
      "ready",
    );
  });

  // Fails if findings at the head are reviewed again instead of answered.
  it.each(["merge after fixes", "needs rework"])(
    "answers a %s review of the head commit with /pr-address",
    (verdict) => {
      expect(nextStep(pullRequest([claudeReview(verdict, HEAD)]))).toBe(
        "address",
      );
    },
  );

  // Fails if a maintainer's review (no 🤖 prefix) counts as Claude's latest.
  it("reads only Claude's reviews", () => {
    const maintainers: Review = {
      body: "Looks fine.",
      submittedAt: "2026-11-04T11:00:00Z",
      commit: { oid: HEAD },
    };
    expect(
      nextStep(
        pullRequest([claudeReview("merge after fixes", HEAD), maintainers]),
      ),
    ).toBe("address");
  });
});

const READY: MergeFacts = {
  pr: pullRequest([claudeReview("ready to merge", HEAD)]),
  ciGreen: true,
  unresolvedThreads: 0,
  issueNeedsDecision: false,
};

describe("unmetMergeConditions", () => {
  // Fails if a condition is reported unmet when all hold, so no PR ever merges.
  it("finds nothing unmet when every condition holds", () => {
    expect(unmetMergeConditions(READY)).toEqual([]);
  });

  // Each case fails if the merge check ignores that one condition.
  it.each<[string, MergeFacts, string]>([
    [
      "the verdict",
      { ...READY, pr: pullRequest([claudeReview("merge after fixes", HEAD)]) },
      'the latest review says "merge after fixes"',
    ],
    [
      "the reviewed commit",
      { ...READY, pr: pullRequest([claudeReview("ready to merge", OLDER)]) },
      "the latest review isn't at the head commit bbbbbbb",
    ],
    ["CI", { ...READY, ciGreen: false }, "CI isn't green at the head commit"],
    [
      "unresolved threads",
      { ...READY, unresolvedThreads: 2 },
      "2 review threads are unresolved",
    ],
    [
      "the PR's needs-decision",
      {
        ...READY,
        pr: pullRequest(
          [claudeReview("ready to merge", HEAD)],
          ["needs-decision"],
        ),
      },
      "the PR or its issue still has needs-decision",
    ],
    [
      "the issue's needs-decision",
      { ...READY, issueNeedsDecision: true },
      "the PR or its issue still has needs-decision",
    ],
  ])("reports %s alone", (_condition, facts, reason) => {
    expect(unmetMergeConditions(facts)).toEqual([reason]);
  });
});
