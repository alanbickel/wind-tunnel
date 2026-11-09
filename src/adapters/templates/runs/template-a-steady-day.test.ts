import { describe } from "vitest";
import { describeFindings } from "../testing/describe-findings";
import { describeRejectionReasons } from "../testing/describe-rejection-reasons";
import { describeSteadyDayA } from "../scenarios/steady-day.suite";
import { TEMPLATE_A_STEADY_DAY } from "../findings/findings-cases";
import { READING_SEED, SEEDS, projectA } from "../testing/scenario-runs";
import { useRun } from "../testing/use-run";

// Template A's steady day: 0.8 s a run, so the seeds share a file.

describe.each(SEEDS)("Template A, steady day, seed %i", (seed) => {
  const run = useRun({ project: projectA, workloadId: "steady-day", seed });
  describeSteadyDayA(run);
  if (seed !== READING_SEED) return;
  describeFindings(run, TEMPLATE_A_STEADY_DAY);
  describeRejectionReasons(run, { rejectedAs: [] });
});
