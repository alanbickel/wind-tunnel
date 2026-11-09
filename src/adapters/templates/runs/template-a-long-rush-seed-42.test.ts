import { describe } from "vitest";
import { describeLongRushA } from "../scenarios/long-rush-template-a.suite";
import { projectA } from "../testing/scenario-runs";
import { useRun } from "../testing/use-run";
import { describeFindings } from "../testing/describe-findings";
import { describeRejectionReasons } from "../testing/describe-rejection-reasons";
import { TEMPLATE_A_LONG_RUSH } from "../findings/findings-cases";

// Template A's long rush on seed 42, a file of its own so the long runs go
// to different test workers.

describe("Template A, long rush, seed 42", () => {
  const run = useRun({ project: projectA, workloadId: "long-rush", seed: 42 });
  describeLongRushA(run);
  describeFindings(run, TEMPLATE_A_LONG_RUSH);
  describeRejectionReasons(run, {
    rejectedAs: ["orders-db: too-many-connections"],
  });
});
