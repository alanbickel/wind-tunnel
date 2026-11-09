import { describe, expect, it } from "vitest";
import { unexplainedRejections } from "./rejection-runs";
import type { RunGetter } from "./use-run";

// Each limit declares the reason it rejects with (ADR-0015), and the
// findings match a failure's cause to the limit behind it by that reason.
// The component contract checks this for each type on its own; these tests
// check it in the snapshots of whole runs, which is what the findings read.
// Engine timeouts aren't a component's rejections, so they're left out.
// The run itself comes from the file in `../runs/` that calls this.

/** The rejections a run should have. */
export interface RejectionCase {
  /** Each distinct cause, as "component: reason", in order of first rejection. */
  readonly rejectedAs: readonly string[];
}

/** Checks the run's rejections against its snapshots' limit declarations. */
export function describeRejectionReasons(
  getRun: RunGetter,
  { rejectedAs }: RejectionCase,
): void {
  describe("its rejections", () => {
    // Fails if the observer misses rejections, which would let the next
    // test pass without checking them, or if a run stops rejecting where
    // its reading in findings.md says it does.
    it("records the rejections the totals count, from the expected causes", () => {
      const run = getRun();
      const counted = Object.values(run.totals.components).reduce(
        (n, c) => n + c.rejected,
        0,
      );
      expect(run.rejections).toHaveLength(counted);
      const causes = new Set(
        run.rejections.map((r) => `${r.componentId}: ${r.reason}`),
      );
      expect([...causes]).toEqual(rejectedAs);
    });

    // Fails if a limit declares a reason other than the one its behavior
    // rejects with (RDS `connections` declaring "too-many-connection"), if
    // the wrong limit declares it (DynamoDB's `writeUnits` alone), or if
    // the snapshots stop carrying each limit's declaration.
    it("explains every rejection by an exhausted limit that declares its reason", () => {
      expect(unexplainedRejections(getRun())).toEqual([]);
    });
  });
}
