import { describe, expect, it } from "vitest";
import type { LimitUse } from "../../../../domain/metrics/metrics-snapshot";
import { sampleRun } from "../../../testing/sample-findings";
import { sampleSnapshot } from "../../../testing/sample-snapshots";
import { createFindingsCatalog } from "../catalog/create-findings-catalog";
import type { DetectedFinding } from "../finding";
import type { Statement } from "../phrase";
import { failedRequestsDetector } from "./failed-requests";

const detector = failedRequestsDetector(createFindingsCatalog());

/** table's read bucket of 100 tokens, `peak` of them drawn. */
const readUnits = (peak: number): LimitUse => ({
  kind: "rate",
  name: "readUnits",
  whenFull: { kind: "refuse", reason: "throttled" },
  limit: 100,
  current: 0,
  peak,
  ratePerSec: 50,
  takenPerSec: 60,
});

/** table's write bucket of 100 tokens, which refuses as `readUnits` does. */
const writeUnits = (peak: number): LimitUse => ({
  ...readUnits(peak),
  name: "writeUnits",
});

const THROTTLED = "table: throttled";

/** The finding's summary, then its reasons. */
function statements(finding: DetectedFinding | undefined): Statement[] {
  if (finding === undefined) return [];
  return [finding.summary, ...finding.reasons];
}

// The bucket runs out in second 1, while fn's retries still get every read
// through; reads fail in seconds 2 and 3; the bucket refills in second 4.
// table refuses 17 attempts in all, and 3 requests fail.
const throttled = [
  sampleSnapshot({
    second: 1,
    read: { started: 10, succeeded: 10 },
    table: { rejected: 5, limits: [readUnits(99.5)] },
  }),
  sampleSnapshot({
    second: 2,
    read: {
      started: 10,
      succeeded: 8,
      failed: 2,
      failures: { [THROTTLED]: 2 },
    },
    table: { rejected: 8, limits: [readUnits(99.5)] },
  }),
  sampleSnapshot({
    second: 3,
    read: {
      started: 10,
      succeeded: 9,
      failed: 1,
      failures: { [THROTTLED]: 1 },
    },
    table: { rejected: 4, limits: [readUnits(99.5)] },
  }),
  sampleSnapshot({ second: 4, table: { limits: [readUnits(10)] } }),
  sampleSnapshot({ second: 5, table: { limits: [readUnits(0)] } }),
];

describe("failed-requests", () => {
  // Fails if the finding's count, window, or key drifts from the cause's
  // failures in the snapshots, or it stops saying which limit refused them.
  it("gives the cause one failure, counting its requests over its seconds", () => {
    const [finding] = detector.detect(sampleRun(throttled));
    expect(finding).toMatchObject({
      key: {
        kind: "failed-requests",
        componentId: "table",
        reason: "throttled",
        limitName: undefined,
      },
      severity: "failure",
      limitNames: ["readUnits"],
      explains: undefined,
      affected: 3,
      window: { fromMs: 1_000, toMs: 3_000 },
    });
  });

  // Fails if the cause window is read only from the failing seconds: the
  // bucket ran out a second before the first read failed.
  it("walks back to where the limit first ran out", () => {
    const [finding] = detector.detect(sampleRun(throttled));
    expect(finding?.causeWindow).toEqual({ fromMs: 0, toMs: 3_000 });
  });

  // Fails if the walk-back follows a named limit that wasn't out at the
  // first failure: writeUnits' run of seconds out ended before it.
  it("walks back only along a limit that was out at the first failure", () => {
    const failing = {
      started: 1,
      failed: 1,
      failures: { [THROTTLED]: 1 },
    };
    const snapshots = [
      sampleSnapshot({ second: 1, table: { limits: [writeUnits(100)] } }),
      sampleSnapshot({
        second: 2,
        table: { limits: [readUnits(100), writeUnits(100)] },
      }),
      sampleSnapshot({
        second: 3,
        read: failing,
        table: { rejected: 1, limits: [readUnits(100), writeUnits(10)] },
      }),
      sampleSnapshot({
        second: 4,
        read: failing,
        table: { rejected: 1, limits: [readUnits(100), writeUnits(100)] },
      }),
    ];
    const [finding] = detector.detect(sampleRun(snapshots));
    expect(finding?.causeWindow).toEqual({ fromMs: 1_000, toMs: 4_000 });
  });

  // Fails if the limit behind the reason isn't named, or the finding
  // compares refused attempts with failed requests when the caller retried:
  // the retries-absorbed note says that, so the report says it once.
  it("names the bucket, and leaves retried attempts to retries-absorbed", () => {
    const [finding] = detector.detect(sampleRun(throttled));
    expect(statements(finding)).toEqual([
      {
        kind: "requests-failed",
        componentId: "table",
        reason: "throttled",
        failed: 3,
        window: { fromMs: 1_000, toMs: 3_000 },
      },
      {
        kind: "failed-by-workflow",
        workflows: [{ workflowId: "read", failed: 3 }],
        failed: 3,
        answered: 30,
      },
      { kind: "worst-second", failed: 2, endMs: 2_000 },
      {
        kind: "bucket-ran-out",
        componentId: "table",
        limitName: "readUnits",
        limit: 100,
        coverage: { secondsOut: 2, secondsFailing: 2 },
      },
      { kind: "failures-stopped", lastFailedMs: 3_000, quietMs: 2_000 },
      {
        kind: "limit-peaked-after",
        componentId: "table",
        limitName: "readUnits",
        limit: { kind: "rate", limit: 100 },
        peak: 10,
      },
    ]);
  });

  // Fails if the finding stops saying that refused attempts and failed
  // requests are equal when nothing retried them.
  it("says each refused attempt failed a request when nothing retried", () => {
    const once = sampleSnapshot({
      second: 1,
      read: { started: 2, failed: 2, failures: { [THROTTLED]: 2 } },
      table: { rejected: 2, limits: [readUnits(100)] },
    });
    const [finding] = detector.detect(sampleRun([once]));
    expect(statements(finding)).toContainEqual({
      kind: "refused-attempts-failed",
      componentId: "table",
      rejected: 2,
      ended: "requests",
    });
  });

  // Fails if the catalog's advice for the named limit isn't attached.
  it("carries the catalog's fixes for the limit", () => {
    const [finding] = detector.detect(sampleRun(throttled));
    expect(finding?.fixes.length).toBeGreaterThan(0);
    expect(finding?.learnMore).toBe(
      "dynamodb-saves-up-unused-capacity-for-bursts",
    );
  });

  // Fails if a timeout, which no limit explains, gets no finding or one
  // that claims a limit refused it.
  it("gives a timeout its own finding, without a limit", () => {
    const snapshots = [
      sampleSnapshot({
        second: 1,
        read: { started: 4, failed: 4, failures: { "fn: timeout": 4 } },
      }),
    ];
    const [finding] = detector.detect(sampleRun(snapshots));
    expect(finding?.affected).toBe(4);
    expect(finding?.fixes).toEqual([]);
    expect(finding?.summary).toEqual({
      kind: "requests-timed-out",
      componentId: "fn",
      failed: 4,
      window: { fromMs: 0, toMs: 1_000 },
    });
    expect(statements(finding)).toContainEqual({
      kind: "caller-stopped-waiting",
      componentId: "fn",
    });
  });

  // Fails if a reason that no limit declares is dropped instead of being
  // reported as unexplained.
  it("says so when no limit declares the reason", () => {
    const snapshots = [
      sampleSnapshot({
        second: 1,
        read: { started: 1, failed: 1, failures: { [THROTTLED]: 1 } },
        table: { rejected: 1 },
      }),
    ];
    const [finding] = detector.detect(sampleRun(snapshots));
    expect(statements(finding)).toContainEqual({
      kind: "no-limit-refuses",
      componentId: "table",
      reason: "throttled",
    });
  });

  // Fails if a run still going reads as recovered, or as ended.
  it("says the failures go on when the latest second still has them", () => {
    const [finding] = detector.detect(sampleRun(throttled.slice(0, 3)));
    expect(statements(finding)).toContainEqual({
      kind: "requests-still-failing",
      finished: false,
    });
  });

  // Fails if a run without failures gets a failure finding.
  it("finds nothing in a run without failures", () => {
    expect(detector.detect(sampleRun(throttled.slice(3)))).toEqual([]);
  });
});
