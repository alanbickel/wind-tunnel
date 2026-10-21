import { describe, expect, it } from "vitest";
import type { LimitUse } from "../../../../domain/metrics/metrics-snapshot";
import { messageText, sampleRun } from "../../../testing/sample-findings";
import { sampleSnapshot } from "../../../testing/sample-snapshots";
import { createFindingsCatalog } from "../catalog/create-findings-catalog";
import type { Finding } from "../finding";
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

const THROTTLED = "table: throttled";

/** Every sentence of the finding, as plain text. */
function sentences(finding: Finding | undefined): string[] {
  if (finding === undefined) return [];
  return [finding.summary, ...finding.reasons].map(messageText);
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
  // Fails if the finding's count, window, or ID drifts from the cause's
  // failures in the snapshots.
  it("gives the cause one failure, counting its requests over its seconds", () => {
    const [finding] = detector.detect(sampleRun(throttled));
    expect(finding).toMatchObject({
      id: "failed-requests:table: throttled",
      severity: "failure",
      componentId: "table",
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

  // Fails if refused attempts are equated with failed requests when the
  // caller retried, or the limit behind the reason isn't named.
  it("names the bucket, and says attempts aren't requests", () => {
    const [finding] = detector.detect(sampleRun(throttled));
    expect(sentences(finding)).toEqual([
      "3 requests failed with table: throttled, from 1000ms to 3000ms.",
      "That's 3 Read item requests, 0.1 of the 30 answered.",
      "The most in one second was 2, in the second ending at 2000ms.",
      "table's readUnits bucket, which holds 100 tokens, had less than one left in every second with these failures.",
      "table refused 17 attempts, but 3 requests failed with its rejections: callers retried, so attempts aren't requests.",
      "The last failure was in the second ending at 3000ms, and none followed in the 2000 after it.",
      "After it, table's readUnits peaked at 10 of 100 tokens drawn.",
    ]);
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
    expect(sentences(finding).slice(0, 1)).toEqual([
      "4 requests failed because fn didn't answer in time, from 0ms to 1000ms.",
    ]);
    expect(sentences(finding)).toContain(
      "The caller stopped waiting for fn. No limit explains a timeout, so the run can't say why it was slow.",
    );
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
    expect(sentences(finding)).toContain(
      "No limit of table refuses with throttled, so the run can't say what ran out.",
    );
  });

  // Fails if a run still going reads as recovered, or as ended.
  it("says the failures go on when the latest second still has them", () => {
    const [finding] = detector.detect(sampleRun(throttled.slice(0, 3)));
    expect(sentences(finding)).toContain("Requests are still failing with it.");
  });

  // Fails if a run without failures gets a failure finding.
  it("finds nothing in a run without failures", () => {
    expect(detector.detect(sampleRun(throttled.slice(3)))).toEqual([]);
  });
});
