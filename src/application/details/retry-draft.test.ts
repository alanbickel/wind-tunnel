import { describe, expect, it } from "vitest";
import { checkRetryDraft, retryDraft } from "./retry-draft";

describe("a retry field's draft", () => {
  // Fails if retryDraft shows a stored policy's numbers other than as typed.
  it("starts from the stored policy", () => {
    expect(
      retryDraft({ maxAttempts: 3, backoff: "exponential", baseDelayMs: 50 }),
    ).toEqual({
      texts: { maxAttempts: "3", baseDelayMs: "50" },
      backoff: "exponential",
    });
  });

  // Fails if a passing draft isn't turned into the policy, numbers parsed.
  it("passes as a retry policy", () => {
    expect(
      checkRetryDraft({
        texts: { maxAttempts: "4", baseDelayMs: "1,000" },
        backoff: "exponential-jitter",
      }),
    ).toEqual({
      status: "passes",
      value: {
        maxAttempts: 4,
        backoff: "exponential-jitter",
        baseDelayMs: 1_000,
      },
    });
  });

  // Fails if the attempts' rule loses its whole-number check or its
  // bounds, or a message is pinned to the wrong number.
  it.each([
    ["0", "Attempts must be at least 1."],
    ["11", "Attempts must be at most 10."],
    ["2.5", "Attempts must be a whole number."],
  ])("refuses %s attempts", (attempts, message) => {
    expect(
      checkRetryDraft({
        texts: { maxAttempts: attempts, baseDelayMs: "-1" },
        backoff: "none",
      }),
    ).toEqual({
      status: "fails",
      messages: {
        maxAttempts: message,
        baseDelayMs: "The base delay must be at least 0.",
      },
    });
  });
});
