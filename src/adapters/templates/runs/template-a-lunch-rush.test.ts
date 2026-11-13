import { describe } from "vitest";
import { describeTotalsReconcile } from "../../cli/report-reconciles.suite";
import { describeRunAnalysisReconciles } from "../run-analysis-reconciles.suite";
import { describeSendsMatchRun } from "../workload-sends.suite";
import { describeFindings } from "../testing/describe-findings";
import { describeRejectionReasons } from "../testing/describe-rejection-reasons";
import {
  describeLunchRushA,
  describeSameLunchRush,
} from "../scenarios/lunch-rush.suite";
import { TEMPLATE_A_LUNCH_RUSH } from "../findings/findings-cases";
import { READING_SEED, SEEDS, projectA } from "../testing/scenario-runs";
import { useRun } from "../testing/use-run";

// Template A's lunch rush, which is also the run of its first workload that
// the reconciliation checks read.

describeSameLunchRush();

describe.each(SEEDS)("Template A, lunch rush, seed %i", (seed) => {
  const run = useRun({ project: projectA, workloadId: "lunch-rush", seed });
  describeLunchRushA(run);
  if (seed !== READING_SEED) return;
  describeFindings(run, TEMPLATE_A_LUNCH_RUSH);
  describeRejectionReasons(run, {
    rejectedAs: ["orders-db: too-many-connections"],
  });
  describeTotalsReconcile(run);
  describeRunAnalysisReconciles(run);
  describeSendsMatchRun(run);
});
