import { describe } from "vitest";
import {
  describeFailedDeliveries,
  enoughConnections,
  fewerConsumers,
  variant,
} from "../scenarios/failed-deliveries.suite";
import { useRun } from "../testing/use-run";
import { describeFailedDeliveriesReconcile } from "../../cli/report-reconciles.suite";
import { LUNCH_RUSH_10_CONNECTIONS } from "../findings/findings-cases";
import { describeFindings } from "../testing/describe-findings";

// Template B's lunch rush with orders-db cut to 10 connections, and the two
// fixes the findings catalog cites, on seed 42.

describe("Template B, lunch rush, 10 database connections, seed 42", () => {
  const workloadId = "lunch-rush";
  const run = useRun({ project: variant, workloadId, seed: 42 });
  describeFailedDeliveries({
    variant: run,
    enoughConnections: useRun({
      project: enoughConnections,
      workloadId,
      seed: 42,
    }),
    fewerConsumers: useRun({ project: fewerConsumers, workloadId, seed: 42 }),
  });
  describeFindings(run, LUNCH_RUSH_10_CONNECTIONS);
  describeFailedDeliveriesReconcile(run);
});
