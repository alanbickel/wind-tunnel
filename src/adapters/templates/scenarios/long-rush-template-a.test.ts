import { beforeAll, describe, expect, it } from "vitest";
import type { MetricsRun } from "../../../domain/metrics/metrics-collector";
import { RUN_TIMEOUT_MS } from "../testing/run-template";
import type { Phase } from "../testing/scenario-runs";
import {
  SEEDS,
  during,
  failed,
  projectA,
  runScenario,
} from "../testing/scenario-runs";

// Under the long rush, Template A fails for the whole peak. The long rush
// ramps from 200 requests/s at 10 s to 2,000 by 20 s, holds until 140 s, is
// back to 200 by 150 s, and runs to 200 s. Template B's long rush is in its
// own file so the two long runs can go to different test workers.

const LONG_PEAK: Phase = { fromSec: 20, toSec: 140 };
const LONG_AFTER: Phase = { fromSec: 150, toSec: 200 };

describe.each(SEEDS)("Template A in the long rush, seed %i", (seed) => {
  let a: MetricsRun;
  beforeAll(() => {
    a = runScenario({ project: projectA, workloadId: "long-rush", seed });
  }, RUN_TIMEOUT_MS);

  // Fails if orders-db's queryWorkers rises to 64: queries keep up with the
  // peak, so connections are released in time and nothing fails.
  it("fails requests in every second of the peak, all from connection exhaustion", () => {
    for (const snapshot of during(a.snapshots, LONG_PEAK)) {
      expect(failed(snapshot)).toBeGreaterThan(0);
    }
    for (const w of Object.values(a.totals.workflows)) {
      expect(Object.keys(w.failures)).toEqual([
        "orders-db: too-many-connections",
      ]);
    }
  });

  // Fails if the rush doesn't end (the profile stays at 2,000 requests/s
  // after 140 s).
  it("recovers once the rush ends", () => {
    const after = during(a.snapshots, LONG_AFTER);
    expect(after.map(failed)).toEqual(after.map(() => 0));
  });
});
