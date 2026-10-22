import {
  bucketDrained,
  describeFindings,
  failedRequests,
  lateAsyncWork,
} from "../testing/describe-findings";
import { withReadUnitsPerSec } from "../testing/rejection-runs";
import { projectB } from "../testing/scenario-runs";

// findings.md §1.7: Template B's long rush with orders-read's read capacity
// cut to 1,500 a second. Its reads are throttled and retried, so refused
// attempts outnumber failed requests, and the failures must still add up.
// The drained read bucket shows beneath the failure, from 19 s (§1.7.2).
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
            causeFromMs: 19_000,
            // findings.md §1.7, sentence 2.
            sentences: [
              "orders-read's readUnits bucket drained from 19 s and ran out in the second ending at 96 s.",
              "It was last full at 18 s.",
              "From 19 s, requests took more tokens than it refills in every second: 1,597 a second on average, against a refill of 1,500.",
              "Its burst of 7,500 tokens lasted between 76 s and 77 s.",
              "At that flow, a full bucket lasts about 77.2 s: (burst − 1) ÷ (flow − refill).",
            ],
          },
        ],
      },
      { key: lateAsyncWork("orders-queue") },
    ],
  },
]);
