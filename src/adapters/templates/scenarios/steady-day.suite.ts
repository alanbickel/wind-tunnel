import { describe, expect, it } from "vitest";
import type { RunGetter } from "../testing/use-run";
import {
  during,
  exhaustedLimits,
  expectEveryRequestServed,
} from "../testing/scenario-runs";

// Under the steady day, 200 requests/s throughout, both templates have every
// limit to spare. Each template's run is in its file in `../runs/`.

/** Template A's steady day. */
export function describeSteadyDayA(getRun: RunGetter): void {
  describe("the steady day", () => {
    // Fails if the steady day runs at 250 requests/s: nothing fails, but
    // orders-db's 16 query workers all fill at once on seeds 7 and 2026.
    it("serves Template A's traffic with every limit to spare", () => {
      const a = getRun();
      expectEveryRequestServed(a.totals);
      expect(exhaustedLimits(a.totals)).toEqual([]);
    });
  });
}

/** Template B's steady day. */
export function describeSteadyDayB(getRun: RunGetter): void {
  describe("the steady day", () => {
    // In the first second, fn-writer's cold starts hold the queue's consumer
    // slots long enough to fill all 15 on seeds 42 and 7, so the check starts
    // at the second second. Fails if orders-queue's consumerMaxConcurrency
    // drops to 2 (its minimum): both consumers are busy at once every second.
    it("serves Template B's traffic with every limit to spare once fn-writer is warm", () => {
      const b = getRun();
      expectEveryRequestServed(b.totals);
      const warm = during(b.snapshots, { fromSec: 1, toSec: 60 });
      expect(warm.flatMap(exhaustedLimits)).toEqual([]);
    });
  });
}
