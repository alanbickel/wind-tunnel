import { describe } from "vitest";
import { READ_CAPACITY_1500 } from "../findings/findings-cases";
import { describeFindings } from "../testing/describe-findings";
import { describeRejectionReasons } from "../testing/describe-rejection-reasons";
import { withReadUnitsPerSec } from "../testing/rejection-runs";
import { READING_SEED, projectB } from "../testing/scenario-runs";
import { useRun } from "../testing/use-run";

// findings.md §1.7: Template B's long rush with orders-read's read capacity
// cut to 1,500 a second, so the read bucket drains and throttles. It's the
// only run whose rejections come from a token bucket, and many of them are
// retried.

describe("Template B, long rush, read capacity 1,500", () => {
  const run = useRun({
    project: withReadUnitsPerSec(projectB, 1500),
    workloadId: "long-rush",
    seed: READING_SEED,
  });
  describeFindings(run, READ_CAPACITY_1500);
  describeRejectionReasons(run, { rejectedAs: ["orders-read: throttled"] });
});
