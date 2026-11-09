import { describe } from "vitest";
import { describeFindings } from "../testing/describe-findings";
import { describeRejectionReasons } from "../testing/describe-rejection-reasons";
import { describeSteadyDayB } from "../scenarios/steady-day.suite";
import { TEMPLATE_B_STEADY_DAY } from "../findings/findings-cases";
import { READING_SEED, SEEDS, projectB } from "../testing/scenario-runs";
import { useRun } from "../testing/use-run";

// Template B's steady day: a short run, so the seeds share a file.

describe.each(SEEDS)("Template B, steady day, seed %i", (seed) => {
  const run = useRun({ project: projectB, workloadId: "steady-day", seed });
  describeSteadyDayB(run);
  if (seed !== READING_SEED) return;
  describeFindings(run, TEMPLATE_B_STEADY_DAY);
  describeRejectionReasons(run, { rejectedAs: [] });
});
