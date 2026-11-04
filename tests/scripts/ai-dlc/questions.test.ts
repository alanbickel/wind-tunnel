import { describe, expect, it } from "vitest";
import type { Comment } from "../../../scripts/ai-dlc/github.js";
import {
  questionBanner,
  questionState,
} from "../../../scripts/ai-dlc/questions.js";

const comment = (body: string, createdAt: string): Comment => ({
  body,
  createdAt,
  url: `https://example.test/${createdAt}`,
});

const QUESTION = comment(
  "🤖 Claude question: which option?",
  "2026-11-04T10:00:00Z",
);
const EARLIER_ANSWER = comment("Go with option 1.", "2026-11-04T09:00:00Z");
const LATER_ANSWER = comment("Go with option 1.", "2026-11-04T11:00:00Z");

describe("questionState", () => {
  // Fails if a maintainer comment from before the question counts as its answer,
  // so the run resumes past a question no one has answered.
  it("waits when the maintainer's newest comment is older than the question", () => {
    expect(questionState([EARLIER_ANSWER, QUESTION])).toEqual({
      question: QUESTION,
      answer: undefined,
    });
  });

  // Fails if an answer after the question doesn't resume the run.
  it("resumes when a maintainer comment is newer than the question", () => {
    expect(questionState([QUESTION, LATER_ANSWER]).answer).toBe(LATER_ANSWER);
  });

  // Fails if a session's own comment after the question counts as the maintainer's answer.
  it("doesn't take a 🤖 comment for an answer", () => {
    const authorReply = comment(
      "🤖 Claude (author): **[decision]** Asked the maintainer.",
      "2026-11-04T11:00:00Z",
    );
    expect(questionState([QUESTION, authorReply]).answer).toBeUndefined();
  });

  // Fails if the empty review shell GitHub creates around an inline reply counts as an answer.
  it("doesn't take an empty review body for an answer", () => {
    const shell = comment("  ", "2026-11-04T11:00:00Z");
    expect(questionState([QUESTION, shell]).answer).toBeUndefined();
  });

  // Fails if only an older question is weighed, so an answer to it resumes past a newer one.
  it("weighs the answer against the newest question", () => {
    const newerQuestion = comment(
      "🤖 Claude question: and now?",
      "2026-11-04T12:00:00Z",
    );
    expect(questionState([QUESTION, LATER_ANSWER, newerQuestion])).toEqual({
      question: newerQuestion,
      answer: undefined,
    });
  });

  // Fails if a maintainer comment resumes a run whose label has no question to answer.
  it("waits, with no question, when there is none", () => {
    expect(questionState([LATER_ANSWER])).toEqual({
      question: undefined,
      answer: undefined,
    });
  });
});

describe("questionBanner", () => {
  // Fails if a label with no question stops the run without saying why.
  it("says when the label has no question", () => {
    expect(questionBanner("PR #5", undefined)).toContain(
      'PR #5 has needs-decision, but no "🤖 Claude question:" comment was found.',
    );
  });

  // Fails if the banner leaves out the question's text or its link.
  it("shows the question with its link", () => {
    const banner = questionBanner("issue #4", QUESTION);
    expect(banner).toContain(QUESTION.body);
    expect(banner).toContain(QUESTION.url);
  });
});
