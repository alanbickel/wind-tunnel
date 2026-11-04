import { describe, expect, it } from "vitest";
import { deferredItems } from "../../../scripts/ai-dlc/deferred-checks.js";
import type { Comment, Issue } from "../../../scripts/ai-dlc/github.js";

const comment = (body: string): Comment => ({
  body,
  createdAt: "2026-11-04T10:00:00Z",
  url: "https://example.test/comment",
});

const issueWith = (comments: Comment[]): Issue => ({
  number: 4,
  title: "feat: something",
  state: "OPEN",
  labels: [],
  comments,
  parent: 3,
});

describe("deferredItems", () => {
  // Fails if a box the author ticked stays ticked, so the maintainer's checklist
  // shows a check as done that no person did.
  it("resets ticked boxes", () => {
    const issue = issueWith([
      comment(
        "🤖 Claude deferred checks:\n\n- [x] Open the app.\n  - [X] Click Run.",
      ),
    ]);
    expect(deferredItems(issue)).toEqual([
      "- [ ] Open the app.",
      "- [ ] Click Run.",
    ]);
  });

  // Fails if the comment's prose, or another comment's checklist, joins the list.
  it("keeps only checklist items from deferred-checks comments", () => {
    const issue = issueWith([
      comment(
        "🤖 Claude deferred checks:\n\nThese need a browser.\n- a plain bullet\n- [ ] Open the app.",
      ),
      comment("🤖 Claude decisions:\n\n- [ ] not a deferred check"),
    ]);
    expect(deferredItems(issue)).toEqual(["- [ ] Open the app."]);
  });
});
