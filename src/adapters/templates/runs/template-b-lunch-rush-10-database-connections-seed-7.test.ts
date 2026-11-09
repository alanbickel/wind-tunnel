import { describe } from "vitest";
import {
  describeFailedDeliveries,
  enoughConnections,
  fewerConsumers,
  variant,
} from "../scenarios/failed-deliveries.suite";
import { useRun } from "../testing/use-run";

// Template B's lunch rush with orders-db cut to 10 connections, and the two
// fixes the findings catalog cites, on seed 7.

describe("Template B, lunch rush, 10 database connections, seed 7", () => {
  const workloadId = "lunch-rush";
  const run = useRun({ project: variant, workloadId, seed: 7 });
  describeFailedDeliveries({
    variant: run,
    enoughConnections: useRun({
      project: enoughConnections,
      workloadId,
      seed: 7,
    }),
    fewerConsumers: useRun({ project: fewerConsumers, workloadId, seed: 7 }),
  });
});
