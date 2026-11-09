import { describe } from "vitest";
import { describeLongRushA } from "../scenarios/long-rush-template-a.suite";
import { projectA } from "../testing/scenario-runs";
import { useRun } from "../testing/use-run";

// Template A's long rush on seed 7, a file of its own so the long runs go
// to different test workers.

describe("Template A, long rush, seed 7", () => {
  const run = useRun({ project: projectA, workloadId: "long-rush", seed: 7 });
  describeLongRushA(run);
});
