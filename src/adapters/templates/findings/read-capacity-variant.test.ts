import {
  backlog,
  bucketDrained,
  describeFindings,
  failedRequests,
  lateAsyncWork,
  retriesAbsorbed,
} from "../testing/describe-findings";
import { withReadUnitsPerSec } from "../testing/rejection-runs";
import { projectB } from "../testing/scenario-runs";

// findings.md §1.7: Template B's long rush with orders-read's read capacity
// cut to 1,500 a second. Its reads are throttled and retried, so refused
// attempts outnumber failed requests, and the failures must still add up.
// The drained read bucket shows beneath the failure, from 18 s (§1.7.2),
// and the retries that got most reads through are a note of their own
// (§1.7.3).
// Why these tests exist is in `../testing/describe-findings.ts`.

describeFindings([
  {
    name: "Template B, long rush, read capacity 1,500",
    project: withReadUnitsPerSec(projectB, 1500),
    workloadId: "long-rush",
    reading: "1.7",
    findings: [
      {
        key: failedRequests("orders-read", "throttled"),
        causes: [
          {
            key: bucketDrained("orders-read", "readUnits"),
            causeFromMs: 18_000,
            // findings.md §1.7, sentence 2.
            sentences: [
              "orders-read's readUnits bucket drained from 18 s and ran out in the second ending at 96 s.",
              "It was last full at 18 s. From then, requests took 1,595 tokens a second on average, against a refill of 1,500.",
              "Its burst of 7,500 tokens lasted between 77 s and 78 s.",
              "At that flow, a full bucket lasts about 78.9 s: (burst − 1) ÷ (flow − refill).",
            ],
          },
        ],
      },
      {
        key: lateAsyncWork("orders-queue"),
        causes: [
          {
            key: backlog("orders-queue", "consumerConcurrency"),
            causeFromMs: 15_000,
          },
        ],
      },
      {
        key: retriesAbsorbed("orders-read"),
        // findings.md §1.7, sentence 3: Get order's p99 rose while reads
        // were throttled.
        sentences: [
          "orders-read refused 64,201 attempts, but only 4,377 requests failed with its rejections: callers retried the rest.",
          "It refused attempts in 46 seconds from 95 s to 141 s.",
          "Attempts aren't requests: a request refused twice and then served counts as two refused attempts, so the difference isn't how many requests the retries saved.",
          "It refuses only with throttled, so the attempts and the requests are both throttled rejections.",
          "While it refused attempts, Get order's p99 was 185 ms in the median second, and up to 445 ms, against 108 ms in the median second before.",
        ],
      },
    ],
  },
]);
