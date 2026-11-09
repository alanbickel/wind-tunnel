import { describe } from "vitest";
import { LONG_RUSH_10_CONNECTIONS } from "../findings/findings-cases";
import { describeFindings } from "../testing/describe-findings";
import { withMaxConnections } from "../testing/rejection-runs";
import { READING_SEED, projectB } from "../testing/scenario-runs";
import { useRun } from "../testing/use-run";

// findings.md §1.8, "The long rush": Template B with orders-db cut to 10
// connections, which the long rush's late writes degrade.

describe("Template B, long rush, 10 database connections", () => {
  const run = useRun({
    project: withMaxConnections(projectB, 10),
    workloadId: "long-rush",
    seed: READING_SEED,
  });
  describeFindings(run, LONG_RUSH_10_CONNECTIONS);
});
