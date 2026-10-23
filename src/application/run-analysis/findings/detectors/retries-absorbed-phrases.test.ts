import { describe, expect, it } from "vitest";
import { checkPhrases } from "../../../testing/check-phrases";
import { RETRIES_ABSORBED_PHRASES } from "./retries-absorbed-phrases";

/** table's refusals, with the work they failed. */
const absorbed = {
  kind: "retries-absorbed",
  componentId: "table",
  rejected: 17,
} as const;

describe("retries-absorbed's phrases", () => {
  // Fails if a phrase's long or short form is worded other than its case
  // says, a long form loses its closing period or a short form gains one,
  // or a kind the table registers has no case here.
  it("words every case at both lengths", () => {
    expect(
      checkPhrases({
        phrases: RETRIES_ABSORBED_PHRASES,
        cases: [
          {
            name: "refusals that failed some requests",
            statement: { ...absorbed, failedRequests: 3, failedDeliveries: 0 },
            long: "table refused 17 attempts, but only 3 requests failed with its rejections: callers retried the rest.",
            short:
              "table refused 17 attempts, and only 3 requests failed with them",
          },
          {
            name: "refusals that failed a request and a delivery",
            statement: { ...absorbed, failedRequests: 1, failedDeliveries: 1 },
            long: "table refused 17 attempts, but only 1 request and 1 delivery failed with its rejections: callers retried the rest.",
            short:
              "table refused 17 attempts, and only 1 request and 1 delivery failed with them",
          },
          {
            name: "refusals that failed nothing",
            statement: { ...absorbed, failedRequests: 0, failedDeliveries: 0 },
            long: "table refused 17 attempts, but no request failed with its rejections: callers retried every one.",
            short: "table refused 17 attempts, and callers retried every one",
          },
          {
            name: "the seconds it refused in",
            statement: {
              kind: "refusing-seconds",
              componentId: "table",
              seconds: 3,
              window: { fromMs: 2_000, toMs: 5_000 },
            },
            long: "It refused attempts in 3 seconds from 2000ms to 5000ms.",
            short: "table refused attempts in 3 seconds",
          },
          {
            name: "why attempts aren't requests",
            statement: { kind: "attempts-are-not-requests" },
            long: "Attempts aren't requests: a request refused twice and then served counts as two refused attempts, so the difference isn't how many requests the retries saved.",
            short:
              "the difference isn't how many requests the retries saved, since attempts aren't requests",
          },
          {
            name: "no reasons",
            statement: {
              kind: "refusal-reasons",
              componentId: "table",
              reasons: [],
            },
            long: "None of its limits declares a rejection reason, and no request failed with one, so the run can't say why it refused.",
            short: "the run can't say why table refused",
          },
          {
            name: "one reason",
            statement: {
              kind: "refusal-reasons",
              componentId: "table",
              reasons: ["throttled"],
            },
            long: "It refuses only with throttled, so the attempts and the requests are both throttled rejections.",
            short: "table refuses only with throttled",
          },
          {
            name: "several reasons",
            statement: {
              kind: "refusal-reasons",
              componentId: "table",
              reasons: ["throttled", "full"],
            },
            long: "It refuses with throttled and full, and refused attempts aren't counted by reason, so the run can't say how many of each were retried.",
            short:
              "table refuses with throttled and full, which refused attempts don't count apart",
          },
          {
            name: "latency against the seconds before",
            statement: {
              kind: "latency-while-refusing",
              componentId: "table",
              workflowId: "read",
              medianMs: 250,
              highestMs: 300,
              beforeMs: 100,
            },
            long: "While it refused attempts, Read item's p99 was 250 in the median second, and up to 300, against 100 in the median second before.",
            short:
              "Read item's p99 was 250 in the median second while table refused attempts",
          },
          {
            name: "latency with no second before",
            statement: {
              kind: "latency-while-refusing",
              componentId: "table",
              workflowId: "read",
              medianMs: 250,
              highestMs: 300,
              beforeMs: undefined,
            },
            long: "While it refused attempts, Read item's p99 was 250 in the median second, and up to 300.",
            short:
              "Read item's p99 was 250 in the median second while table refused attempts",
          },
        ],
      }),
    ).toEqual([]);
  });
});
