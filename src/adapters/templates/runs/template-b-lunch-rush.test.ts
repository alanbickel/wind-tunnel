import { describe } from "vitest";
import {
  describeQueueReconciles,
  describeTotalsReconcile,
} from "../../cli/report-reconciles.suite";
import { describeRunAnalysisReconciles } from "../run-analysis-reconciles.suite";
import { describeFindings } from "../testing/describe-findings";
import { describeRejectionReasons } from "../testing/describe-rejection-reasons";
import { describeLunchRushB } from "../scenarios/lunch-rush.suite";
import { TEMPLATE_B_LUNCH_RUSH } from "../findings/findings-cases";
import { READING_SEED, SEEDS, projectB } from "../testing/scenario-runs";
import { useRun } from "../testing/use-run";

// Template B's lunch rush, which is also the run of its first workload that
// the reconciliation checks read.

describe.each(SEEDS)("Template B, lunch rush, seed %i", (seed) => {
  const run = useRun({ project: projectB, workloadId: "lunch-rush", seed });
  describeLunchRushB(run);
  if (seed !== READING_SEED) return;
  describeFindings(run, TEMPLATE_B_LUNCH_RUSH);
  describeRejectionReasons(run, { rejectedAs: [] });
  describeTotalsReconcile(run);
  describeQueueReconciles(run);
  describeRunAnalysisReconciles(run);
});
