import { describe, expect, it } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import { runBadgesOf } from "./run-badges";

const run = {
  project: sampleRecord.project,
  workloadId: "steady",
  snapshots: [
    sampleSnapshot({ second: 1, table: { arrivals: 2, rejected: 2 } }),
  ],
};

describe("runBadgesOf", () => {
  // Fails if a missing run gets badges: every component would show ok
  // before the first run.
  it("has no badges before a run", () => {
    expect(runBadgesOf(undefined, false)).toBeUndefined();
  });

  // Fails if the statuses aren't the run's: the table would not be refused.
  it("gives each component's status in the run", () => {
    const badges = runBadgesOf(run, false);

    expect(Object.fromEntries(badges?.statuses ?? [])).toEqual({
      api: "ok",
      fn: "ok",
      table: "refused",
    });
  });

  // Fails if the out-of-date flag is dropped or fixed to false, or fixed to
  // true: the badges would be hollow for a current run, or solid for an old
  // one.
  it("passes the out-of-date flag through", () => {
    expect(runBadgesOf(run, true)?.outOfDate).toBe(true);
    expect(runBadgesOf(run, false)?.outOfDate).toBe(false);
  });
});
