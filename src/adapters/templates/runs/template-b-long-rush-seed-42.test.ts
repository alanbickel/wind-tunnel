import { describe } from "vitest";
import { describeLongRushB } from "../scenarios/long-rush-template-b.suite";
import { projectB } from "../testing/scenario-runs";
import { useRun } from "../testing/use-run";
import { describeFindings } from "../testing/describe-findings";
import { describeRejectionReasons } from "../testing/describe-rejection-reasons";
import { TEMPLATE_B_LONG_RUSH } from "../findings/findings-cases";

// Template B's long rush on seed 42, a file of its own so the long runs go
// to different test workers.

describe("Template B, long rush, seed 42", () => {
  const run = useRun({ project: projectB, workloadId: "long-rush", seed: 42 });
  describeLongRushB(run);
  describeFindings(run, TEMPLATE_B_LONG_RUSH);
  describeRejectionReasons(run, { rejectedAs: [] });
});
