import { describe } from "vitest";
import { describeLongRushB } from "../scenarios/long-rush-template-b.suite";
import { projectB } from "../testing/scenario-runs";
import { useRun } from "../testing/use-run";

// Template B's long rush on seed 2026, a file of its own so the long runs go
// to different test workers.

describe("Template B, long rush, seed 2026", () => {
  const run = useRun({
    project: projectB,
    workloadId: "long-rush",
    seed: 2026,
  });
  describeLongRushB(run);
});
