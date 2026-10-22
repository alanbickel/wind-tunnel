import { describe, expect, it } from "vitest";
import type { LimitUse } from "../../../../domain/metrics/metrics-snapshot";
import { messageText, sampleRun } from "../../../testing/sample-findings";
import { sampleSnapshot } from "../../../testing/sample-snapshots";
import { createFindingsCatalog } from "../catalog/create-findings-catalog";
import type { DetectedFinding } from "../finding";
import { bucketDrainedDetector } from "./bucket-drained";

const detector = bucketDrainedDetector(createFindingsCatalog());

/** One second of table's read bucket of 10 tokens. */
interface BucketSecond {
  readonly second: number;
  /** Tokens missing at the second's end. */
  readonly current: number;
  /** Most tokens missing during the second. */
  readonly peak: number;
  readonly takenPerSec: number;
  /** 5 if left out. */
  readonly ratePerSec?: number;
}

function second(bucket: BucketSecond) {
  const { second: n, current, peak, takenPerSec, ratePerSec = 5 } = bucket;
  const readUnits: LimitUse = {
    kind: "rate",
    name: "readUnits",
    whenFull: { kind: "refuse", reason: "throttled" },
    limit: 10,
    current,
    peak,
    ratePerSec,
    takenPerSec,
  };
  return sampleSnapshot({ second: n, table: { limits: [readUnits] } });
}

/** Every sentence of the finding, as plain text. */
function sentences(finding: DetectedFinding | undefined): string[] {
  if (finding === undefined) return [];
  return [finding.summary, ...finding.reasons].map(messageText);
}

// Full after second 1; reads take more than the refill from second 2; the
// bucket runs out in seconds 4 and 5, and is refilling in second 6.
const drained = [
  second({ second: 1, current: 0, peak: 0.5, takenPerSec: 4 }),
  second({ second: 2, current: 3, peak: 3, takenPerSec: 7 }),
  second({ second: 3, current: 6, peak: 6, takenPerSec: 8 }),
  second({ second: 4, current: 9.5, peak: 9.5, takenPerSec: 9 }),
  second({ second: 5, current: 9.5, peak: 9.6, takenPerSec: 5 }),
  second({ second: 6, current: 6, peak: 9, takenPerSec: 2 }),
];

describe("bucket-drained", () => {
  // Fails if the note isn't about the bucket, doesn't explain it, or
  // counts what it explains.
  it("notes a bucket that ran out, explaining that bucket", () => {
    const [finding] = detector.detect(sampleRun(drained));
    expect(finding).toMatchObject({
      key: {
        kind: "bucket-drained",
        componentId: "table",
        reason: undefined,
        limitName: "readUnits",
      },
      severity: "note",
      limitNames: ["readUnits"],
      explains: { componentId: "table", limitName: "readUnits" },
      affected: undefined,
    });
  });

  // Fails if the cause window starts anywhere but the end of the last full
  // second before the first second out, or the window isn't the seconds
  // out.
  it("starts its cause where the drain began", () => {
    const [finding] = detector.detect(sampleRun(drained));
    expect(finding?.window).toEqual({ fromMs: 3_000, toMs: 5_000 });
    expect(finding?.causeWindow).toEqual({ fromMs: 1_000, toMs: 5_000 });
  });

  // Fails if the mean flow includes a second outside the drain, the time it
  // lasted isn't bounded by the second it ran out, or the formula drifts
  // from (burst − 1) ÷ (flow − refill).
  it("quotes when it was last full, the flow over the drain, and how long it lasted", () => {
    expect(sentences(detector.detect(sampleRun(drained))[0])).toEqual([
      "table's readUnits bucket drained from 1000ms and ran out in the second ending at 4000ms.",
      "It was last full at 1000ms. From then, requests took 8 tokens a second on average, against a refill of 5.",
      "Its burst of 10 tokens lasted between 2000 and 3000.",
      "At that flow, a full bucket lasts about 3000: (burst − 1) ÷ (flow − refill).",
    ]);
  });

  // Fails if the drain starts after a second at or under the refill rather
  // than where the bucket was last full (here, the run's start: it was never
  // full before it ran out), so the burst and the formula would be about a
  // bucket already part drawn, and the mean flow would leave seconds out.
  it("measures the drain from the last full bucket, through seconds at the refill", () => {
    const split = [
      second({ second: 1, current: 2, peak: 2, takenPerSec: 7 }),
      second({ second: 2, current: 2, peak: 2, takenPerSec: 5 }),
      second({ second: 3, current: 5, peak: 5, takenPerSec: 8 }),
      second({ second: 4, current: 9, peak: 9.5, takenPerSec: 9 }),
    ];
    const [finding] = detector.detect(sampleRun(split));
    expect(finding?.causeWindow).toEqual({ fromMs: 0, toMs: 4_000 });
    expect(sentences(finding)).toEqual([
      "table's readUnits bucket drained from 0ms and ran out in the second ending at 4000ms.",
      "It was last full at 0ms. From then, requests took 7.25 tokens a second on average, against a refill of 5.",
      "Its burst of 10 tokens lasted between 3000 and 4000.",
      "At that flow, a full bucket lasts about 4000: (burst − 1) ÷ (flow − refill).",
    ]);
  });

  // Fails if a bucket drained within one second gets a cause window, a
  // formula from a flow no faster than the refill, or a drain that starts
  // after the second it ran out (that second ends full again: its refill
  // is larger than its burst, as API Gateway's may be).
  it("says so when the tokens went within the second it ran out", () => {
    const ratePerSec = 20;
    const sudden = [
      second({ second: 1, current: 0.5, peak: 2, takenPerSec: 4, ratePerSec }),
      second({ second: 2, current: 0, peak: 9.5, takenPerSec: 15, ratePerSec }),
    ];
    const [finding] = detector.detect(sampleRun(sudden));
    expect(finding?.causeWindow).toBeUndefined();
    expect(sentences(finding).slice(1)).toEqual([
      "It was last full at 1000ms. From then, requests took 15 tokens a second on average, no more than its refill of 20 a second, but faster than the refill within a second.",
      "Its burst of 10 tokens lasted between 0 and 1000.",
    ]);
  });

  // Fails if a bucket that came within one token of running out, but no
  // closer, gets a note.
  it("says nothing of a bucket that never ran out", () => {
    const run = sampleRun([
      second({ second: 1, current: 4, peak: 4, takenPerSec: 9 }),
      second({ second: 2, current: 9, peak: 9, takenPerSec: 10 }),
    ]);
    expect(detector.detect(run)).toEqual([]);
  });

  // Fails if a concurrency limit is read as a bucket.
  it("says nothing of other limits", () => {
    const full: LimitUse = {
      kind: "concurrency",
      name: "slots",
      whenFull: { kind: "refuse", reason: "full" },
      limit: 4,
      current: 4,
      peak: 4,
    };
    const run = sampleRun([
      sampleSnapshot({ second: 1, table: { limits: [full] } }),
    ]);
    expect(detector.detect(run)).toEqual([]);
  });

  // Fails if the advice comes from anything but the bucket's own entry
  // (DynamoDB readUnits).
  it("carries the advice for the bucket", () => {
    const [finding] = detector.detect(sampleRun(drained));
    expect(finding?.learnMore).toBe(
      "dynamodb-saves-up-unused-capacity-for-bursts",
    );
    expect(finding?.fixes).toHaveLength(2);
  });
});
