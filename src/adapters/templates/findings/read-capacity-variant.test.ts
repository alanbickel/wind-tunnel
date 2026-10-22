import { describeFindings } from "../testing/describe-findings";
import { withReadUnitsPerSec } from "../testing/rejection-runs";
import { projectB } from "../testing/scenario-runs";

// findings.md §1.7: Template B's long rush with orders-read's read capacity
// cut to 1,500 a second. Its reads are throttled and retried, so refused
// attempts outnumber failed requests, and the failures must still add up.
// Why these tests exist is in `../testing/describe-findings.ts`.

describeFindings([
  {
    name: "Template B, long rush, read capacity 1,500",
    project: withReadUnitsPerSec(projectB, 1500),
    workloadId: "long-rush",
    reading: "1.7",
    findingIds: [
      "failed-requests:orders-read: throttled",
      "late-async-work:orders-queue",
    ],
  },
]);
