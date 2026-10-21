import { beforeAll, describe, expect, it } from "vitest";
import type { MetricsRun } from "../../../domain/metrics/metrics-collector";
import { RUN_TIMEOUT_MS } from "../testing/run-template";
import {
  SEEDS,
  during,
  exhaustedLimits,
  expectEveryRequestServed,
  projectA,
  projectB,
  runScenario,
} from "../testing/scenario-runs";

// Under the steady day, 200 requests/s throughout, both templates have every
// limit to spare.

describe.each(SEEDS)("the steady day, with seed %i", (seed) => {
  let a: MetricsRun, b: MetricsRun;
  beforeAll(() => {
    a = runScenario({ project: projectA, workloadId: "steady-day", seed });
    b = runScenario({ project: projectB, workloadId: "steady-day", seed });
  }, RUN_TIMEOUT_MS);

  // Fails if the steady day runs at 250 requests/s: nothing fails, but
  // orders-db's 16 query workers all fill at once on seeds 7 and 2026.
  it("serves Template A's traffic with every limit to spare", () => {
    expectEveryRequestServed(a.totals);
    expect(exhaustedLimits(a.totals)).toEqual([]);
  });

  // In the first second, fn-writer's cold starts hold the queue's consumer
  // slots long enough to fill all 15 on seeds 42 and 7, so the check starts
  // at the second second. Fails if orders-queue's consumerMaxConcurrency
  // drops to 2 (its minimum): both consumers are busy at once every second.
  it("serves Template B's traffic with every limit to spare once fn-writer is warm", () => {
    expectEveryRequestServed(b.totals);
    const warm = during(b.snapshots, { fromSec: 1, toSec: 60 });
    expect(warm.flatMap(exhaustedLimits)).toEqual([]);
  });
});
