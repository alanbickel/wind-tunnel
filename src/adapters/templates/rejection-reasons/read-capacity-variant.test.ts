import { describeRejectionReasons } from "../testing/describe-rejection-reasons";
import { withReadUnitsPerSec } from "../testing/rejection-runs";
import { projectB } from "../testing/scenario-runs";

// findings.md §1.7: Template B's long rush with orders-read's read capacity
// cut to 1,500 a second, so the read bucket drains and throttles. It's the
// only run whose rejections come from a token bucket, and many of them are
// retried. Why these tests exist is in
// `../testing/describe-rejection-reasons.ts`.

describeRejectionReasons([
  {
    name: "Template B, long rush, read capacity 1,500",
    project: withReadUnitsPerSec(projectB, 1500),
    workloadId: "long-rush",
    rejectedAs: ["orders-read: throttled"],
  },
]);
