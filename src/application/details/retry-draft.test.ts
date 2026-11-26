import { describe, expect, it } from "vitest";
import {
  AWS_SDK_STANDARD,
  resolveRetry,
} from "../../domain/engine/resolve-retry";
import {
  checkRetryDraft,
  retryDraft,
  withBackoff,
  withMode,
  withPartText,
  type RetryDraft,
} from "./retry-draft";

/** The preset on an edge into DynamoDB: 4 attempts, 25 ms after a transient error. */
const intoDynamoDb = resolveRetry({
  retry: { preset: "aws-sdk-standard" },
  sdkDefaults: { maxAttempts: 4, transientBaseDelayMs: 25 },
});

/** An edge into DynamoDB that follows the preset, as its field shows it. */
const presetDraft: RetryDraft = retryDraft(
  { preset: "aws-sdk-standard" },
  intoDynamoDb,
);

describe("a retry field's draft", () => {
  // Fails if retryDraft shows a stored policy's numbers other than as typed.
  it("starts from the stored policy", () => {
    expect(
      retryDraft(
        { maxAttempts: 3, backoff: "exponential", baseDelayMs: 50 },
        AWS_SDK_STANDARD,
      ),
    ).toEqual({
      mode: "custom",
      texts: { maxAttempts: "3", baseDelayMs: "50" },
      backoff: "exponential",
    });
  });

  // Fails if the preset shows the SDK's values rather than what it
  // resolves to on the edge, or hides the edge's own attempts.
  it("shows the preset as it resolves on the edge, with the edge's own attempts", () => {
    expect(presetDraft).toEqual({
      mode: "aws-sdk-standard",
      texts: { maxAttempts: "4", baseDelayMs: "1000" },
      backoff: "exponential-jitter",
    });
    expect(
      retryDraft({ preset: "aws-sdk-standard", maxAttempts: 2 }, intoDynamoDb)
        .texts.maxAttempts,
    ).toBe("2");
  });

  // Fails if a passing draft isn't turned into the policy, numbers parsed.
  it("passes as a retry policy", () => {
    expect(
      checkRetryDraft(
        {
          mode: "custom",
          texts: { maxAttempts: "4", baseDelayMs: "1,000" },
          backoff: "exponential-jitter",
        },
        AWS_SDK_STANDARD,
      ),
    ).toEqual({
      status: "passes",
      value: {
        maxAttempts: 4,
        backoff: "exponential-jitter",
        baseDelayMs: 1_000,
      },
    });
  });

  // Fails if the preset stores the attempts its target already gives, so
  // it stops following the type, or drops attempts of the edge's own.
  it.each([
    ["4", { preset: "aws-sdk-standard" }],
    ["2", { preset: "aws-sdk-standard", maxAttempts: 2 }],
  ])("passes the preset with %s attempts as %j", (attempts, value) => {
    const draft = withPartText(presetDraft, {
      key: "maxAttempts",
      text: attempts,
    });
    expect(checkRetryDraft(draft, intoDynamoDb)).toEqual({
      status: "passes",
      value,
    });
  });

  // Fails if attempts of the edge's own make the preset custom, or a new
  // backoff or base delay keeps it (ADR-0025 decision 3.4).
  it.each([
    [
      "new attempts",
      "aws-sdk-standard",
      withPartText(presetDraft, { key: "maxAttempts", text: "2" }),
    ],
    [
      "a new base delay",
      "custom",
      withPartText(presetDraft, { key: "baseDelayMs", text: "200" }),
    ],
    ["a new backoff", "custom", withBackoff(presetDraft, "exponential")],
  ])("after %s, the preset's draft is %s", (_change, mode, draft) => {
    expect(draft.mode).toBe(mode);
  });

  // Fails if switching to custom starts from values other than those the
  // field showed: the preset's attempts, backoff, and throttle delay.
  it("starts a custom policy from the preset's values as shown", () => {
    const custom = withMode(presetDraft, {
      mode: "custom",
      sdkStandard: intoDynamoDb,
    });
    expect(checkRetryDraft(custom, intoDynamoDb)).toEqual({
      status: "passes",
      value: {
        maxAttempts: 4,
        backoff: "exponential-jitter",
        baseDelayMs: 1_000,
      },
    });
  });

  // Fails if picking the preset keeps a custom policy's numbers, or
  // stores attempts of the edge's own.
  it("picks the preset afresh, following its target", () => {
    const custom = retryDraft(
      { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
      intoDynamoDb,
    );
    const preset = withMode(custom, {
      mode: "aws-sdk-standard",
      sdkStandard: intoDynamoDb,
    });
    expect(preset).toEqual(presetDraft);
    expect(checkRetryDraft(preset, intoDynamoDb)).toEqual({
      status: "passes",
      value: { preset: "aws-sdk-standard" },
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
      checkRetryDraft(
        {
          mode: "custom",
          texts: { maxAttempts: attempts, baseDelayMs: "-1" },
          backoff: "none",
        },
        AWS_SDK_STANDARD,
      ),
    ).toEqual({
      status: "fails",
      messages: {
        maxAttempts: message,
        baseDelayMs: "The base delay must be at least 0.",
      },
    });
  });
});
