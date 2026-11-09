import { describe, expect, it } from "vitest";
import { createDetectors } from "../../../application/run-analysis/findings/create-detectors";
import { findRun } from "../../../application/run-analysis/findings/find-run";
import { componentIn } from "../../../domain/metrics/testing/snapshot-lookups";
import {
  withConsumerMaxConcurrency,
  withMaxConnections,
} from "../testing/rejection-runs";
import {
  backlog,
  expectEveryRequestServed,
  projectB,
} from "../testing/scenario-runs";
import type { RunGetter } from "../testing/use-run";

// findings.md §1.8: Template B's lunch rush with orders-db cut to 10
// connections, fewer than orders-queue's 15 consumers. Each delivery holds
// a connection while its query runs, so in bursts the consumers ask for
// more than orders-db has, and it refuses some deliveries. No request
// fails: each sender was answered "accepted". These tests are the evidence
// for the failed-deliveries fixes in the findings catalog (§1.8.9).

/** The variant at 10 connections, with its fixes. */
export const variant = withMaxConnections(projectB, 10);
export const enoughConnections = withMaxConnections(projectB, 15);
export const fewerConsumers = withConsumerMaxConcurrency(variant, 10);

/** The three lunch rush runs, each from its file in `../runs/`. */
export interface FailedDeliveryRuns {
  readonly variant: RunGetter;
  readonly enoughConnections: RunGetter;
  readonly fewerConsumers: RunGetter;
}

/** Template B's lunch rush with 10 database connections, and its fixes. */
export function describeFailedDeliveries(runs: FailedDeliveryRuns): void {
  describe("failed deliveries, with 10 database connections", () => {
    // Fails if orders-db's maxConnections is 15 or more: every consumer can
    // hold one at once. Also fails if a refused delivery fails its request.
    it("fails some deliveries, but no request", () => {
      const { totals } = runs.variant();
      expect(componentIn(totals, "orders-queue").asyncFailed).toBeGreaterThan(
        0,
      );
      for (const [id, w] of Object.entries(totals.workflows)) {
        expect({ id, failed: w.failed }).toEqual({ id, failed: 0 });
      }
    });

    // Fails if maxConnections stays at 10: orders-db refuses some
    // deliveries, as above.
    it("fails no delivery when every consumer can hold a connection", () => {
      const { totals } = runs.enoughConnections();
      expectEveryRequestServed(totals);
      expect(componentIn(totals, "orders-queue").asyncFailed).toBe(0);
    });

    // 10 consumers deliver about 210 writes a second against 400 arriving at
    // the peak, so the backlog outlasts the run, and the backlog finding is
    // a warning. Fails if consumerMaxConcurrency stays at 15: the backlog
    // empties. Also fails at 11: on seed 7, orders-db refuses a delivery.
    it("leaves messages waiting when the consumers shrink to fit", () => {
      const run = runs.fewerConsumers();
      expectEveryRequestServed(run.totals);
      expect(componentIn(run.totals, "orders-queue").asyncFailed).toBe(0);
      expect(run.snapshots.map(backlog).at(-1)).toBeGreaterThan(0);
      const soFar = {
        project: run.project,
        workloadId: run.workloadId,
        snapshots: run.snapshots,
      };
      expect(findRun(soFar, createDetectors()).verdict.level).toBe("degraded");
    });
  });
}
